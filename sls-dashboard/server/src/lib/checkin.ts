/**
 * QR check-in.
 *
 * Each event carries an opaque `checkin_token`. The dashboard renders a QR code
 * encoding <baseUrl>/checkin/<token>; a phone's built-in camera opens that URL,
 * the member identifies themselves with their member code, and the server stamps
 * arrival. A second scan stamps departure and the hours engine recomputes the
 * entry from the real elapsed time. No scanner app, no hardware, no extra library.
 */
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { postHoursForEvent } from './engagement.js';

export function eventByToken(token: string) {
  return db.prepare(`
    SELECT e.*, i.name initiative_name, i.pillar
    FROM events e LEFT JOIN initiatives i ON i.id=e.initiative_id
    WHERE e.checkin_token=?`).get(token) as any;
}

export async function checkinQrSvg(token: string, baseUrl: string): Promise<string> {
  return QRCode.toString(`${baseUrl}/checkin/${token}`, { type: 'svg', margin: 1, width: 320, errorCorrectionLevel: 'M' });
}

export function ensureToken(eventId: number): string {
  const ev = db.prepare('SELECT checkin_token FROM events WHERE id=?').get(eventId) as any;
  if (ev?.checkin_token) return ev.checkin_token;
  const token = `evt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  db.prepare('UPDATE events SET checkin_token=? WHERE id=?').run(token, eventId);
  return token;
}

export type CheckinOutcome = {
  ok: boolean;
  action: 'checked-in' | 'checked-out' | 'already-complete' | 'error';
  message: string;
  member?: { id: number; name: string; member_code: string };
  event?: { id: number; name: string; date: string };
  hours?: number;
};

/** One endpoint handles both directions: first scan = in, second = out. */
export function scan(token: string, memberCode: string): CheckinOutcome {
  const ev = eventByToken(token);
  if (!ev) return { ok: false, action: 'error', message: 'That check-in code is not valid.' };
  if (ev.status === 'cancelled') return { ok: false, action: 'error', message: 'This event was cancelled.' };

  const member = db.prepare('SELECT id, name, member_code FROM members WHERE member_code = ? COLLATE NOCASE')
    .get(String(memberCode).trim()) as any;
  if (!member) return { ok: false, action: 'error', message: `No member found with code "${memberCode}". Check the code on your membership card.` };

  const now = new Date().toISOString().slice(0, 19);
  const existing = db.prepare('SELECT * FROM event_attendance WHERE event_id=? AND member_id=?').get(ev.id, member.id) as any;

  const base = { member: { id: member.id, name: member.name, member_code: member.member_code }, event: { id: ev.id, name: ev.name, date: ev.date } };

  if (!existing) {
    db.prepare(`INSERT INTO event_attendance (event_id,member_id,registered_at,checked_in_at,role,source,no_show)
                VALUES (?,?,?,?,'attendee','qr',0)`).run(ev.id, member.id, now, now);
    maybePost(ev);
    return { ok: true, action: 'checked-in', message: `Welcome, ${member.name}. You're checked in.`, ...base };
  }
  if (!existing.checked_in_at) {
    db.prepare("UPDATE event_attendance SET checked_in_at=?, source='qr', no_show=0 WHERE id=?").run(now, existing.id);
    maybePost(ev);
    return { ok: true, action: 'checked-in', message: `Welcome, ${member.name}. You're checked in.`, ...base };
  }
  if (!existing.checked_out_at) {
    db.prepare('UPDATE event_attendance SET checked_out_at=? WHERE id=?').run(now, existing.id);
    maybePost(ev);
    const hrs = db.prepare('SELECT hours FROM engagement_logs WHERE member_id=? AND related_event_id=?').get(member.id, ev.id) as any;
    return { ok: true, action: 'checked-out', message: `Thanks for joining, ${member.name}.`, hours: hrs?.hours, ...base };
  }
  const hrs = db.prepare('SELECT hours FROM engagement_logs WHERE member_id=? AND related_event_id=?').get(member.id, ev.id) as any;
  return { ok: true, action: 'already-complete', message: `You've already checked in and out, ${member.name}.`, hours: hrs?.hours, ...base };
}

/** Post hours live for an event that is already closed, so the ledger stays current. */
function maybePost(ev: any) {
  if (ev.status === 'closed' || ev.status === 'open') {
    try { postHoursForEvent(ev.id, 'qr-scan'); } catch { /* non-fatal */ }
  }
}
