/**
 * Hours-derivation rules. These encode field realities that are easy to regress:
 * a double-scan at the door, a missed exit scan, a scan picked up the next day.
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHours, type Rule } from './engagement.js';

const rule: Rule = {
  activity_type: 'event attendance',
  default_hours: 2,
  role_multiplier: { speaker: 1.5, organiser: 2 },
  counts_toward_recognition: 1,
  description: null,
};

const cases: Array<[string, Parameters<typeof deriveHours>[0], number, string, string | undefined]> = [
  ['a normal scan pair uses the real elapsed time',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-01T11:00:00', eventDuration: 2, role: 'attendee', rule }, 2, 'checkin-checkout', undefined],
  ['leaving early is honoured',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-01T10:00:00', eventDuration: 2, role: 'attendee', rule }, 1, 'checkin-checkout', undefined],
  ['a double scan at the door falls back to the scheduled duration',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-01T09:01:00', eventDuration: 2, role: 'attendee', rule }, 2, 'event-duration', 'too-short'],
  ['an exit scan on a later day falls back to the scheduled duration',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-02T09:00:00', eventDuration: 2, role: 'attendee', rule }, 2, 'event-duration', 'different-day'],
  ['a check-out before check-in falls back',
    { checkedInAt: '2026-05-01T11:00:00', checkedOutAt: '2026-05-01T09:00:00', eventDuration: 2, role: 'attendee', rule }, 2, 'event-duration', 'negative'],
  ['no check-out uses the scheduled duration',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: null, eventDuration: 2, role: 'attendee', rule }, 2, 'event-duration', undefined],
  ['a forgotten exit scan is capped at twice the duration',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-01T23:00:00', eventDuration: 2, role: 'attendee', rule }, 4, 'checkin-checkout', undefined],
  ['a speaker earns the role multiplier',
    { checkedInAt: null, checkedOutAt: null, eventDuration: 2, role: 'speaker', rule }, 3, 'event-duration', undefined],
  ['with no event duration the rule default applies',
    { checkedInAt: null, checkedOutAt: null, eventDuration: null, role: 'attendee', rule }, 2, 'rule-default', undefined],
  ['hours round to the nearest quarter',
    { checkedInAt: '2026-05-01T09:00:00', checkedOutAt: '2026-05-01T10:50:00', eventDuration: 2, role: 'attendee', rule }, 1.75, 'checkin-checkout', undefined],
];

for (const [name, args, hours, basis, rejected] of cases) {
  test(name, () => {
    const r = deriveHours(args);
    assert.equal(r.hours, hours, `hours: got ${r.hours}, want ${hours}`);
    assert.equal(r.basis, basis, `basis: got ${r.basis}, want ${basis}`);
    assert.equal(r.scanRejected, rejected);
  });
}
