/**
 * Command palette — ⌘K / Ctrl-K from anywhere.
 *
 * Two jobs: jump to a page, and find one record among hundreds. With 974 members
 * the fastest route to a person was previously to open Members, type in the search
 * box, and page through; this makes it three keystrokes from any screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../state';
import { useI18n } from '../i18n';

type Row = { id: number; title: string; subtitle?: string; meta?: string };
type Group = { kind: string; label: string; rows: Row[] };
type Item = { key: string; label: string; hint?: string; badge?: string; run: () => void };

const PAGES: Array<{ id: string; route: string; keywords: string }> = [
  { id: 'overview', route: '/overview', keywords: 'home dashboard kpi summary alerts' },
  { id: 'members', route: '/members', keywords: 'people roster cohort directory' },
  { id: 'engagement', route: '/engagement', keywords: 'hours ledger rules verify recognition' },
  { id: 'initiatives', route: '/initiatives', keywords: 'events programmes qr check-in recap' },
  { id: 'impact', route: '/impact', keywords: 'startups metrics challenge leaderboard' },
  { id: 'newsletter', route: '/newsletter', keywords: 'monthly issue template pdf print' },
  { id: 'social', route: '/social', keywords: 'linkedin mentions wall triage' },
  { id: 'ai', route: '/ai', keywords: 'analyst chat reports conversations' },
  { id: 'exports', route: '/exports', keywords: 'pdf power bi csv download report' },
  { id: 'ingest', route: '/ingest', keywords: 'csv upload import mapping data' },
  { id: 'council', route: '/council', keywords: 'cockpit role governance chair' },
  { id: 'settings', route: '/settings', keywords: 'api key brand tokens language anthropic' },
];

export function CommandPalette({ open, onClose, onOpenChat }:
  { open: boolean; onClose: () => void; onOpenChat: () => void }) {
  const { navigate } = useApp();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setGroups([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open || q.trim().length < 2) { setGroups([]); return; }
    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(() => {
      api.get<{ groups: Group[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then(r => { if (!cancelled) setGroups(r.groups ?? []); })
        .catch(() => { if (!cancelled) setGroups([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [q, open]);

  const go = useCallback((route: string) => { navigate(route); onClose(); }, [navigate, onClose]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];

    const pages = PAGES.filter(p => {
      if (!needle) return true;
      const name = String((t.nav as any)[p.id] ?? p.id).toLowerCase();
      return name.includes(needle) || p.keywords.includes(needle) || p.id.includes(needle);
    });
    for (const p of pages) {
      out.push({ key: `page:${p.id}`, label: String((t.nav as any)[p.id] ?? p.id), badge: 'Page', run: () => go(p.route) });
    }

    if (!needle) {
      out.push({ key: 'act:ai', label: t.ai.title, badge: 'Action', hint: 'Ask the analyst', run: () => { onClose(); onOpenChat(); } });
    }

    for (const g of groups) {
      for (const r of g.rows) {
        out.push({
          key: `${g.kind}:${r.id}`,
          label: r.title,
          hint: [r.subtitle, r.meta].filter(Boolean).join(' · '),
          badge: g.label.replace(/s$/, ''),
          run: () => {
            if (g.kind === 'member') go(`/members/${r.id}`);
            else if (g.kind === 'event' || g.kind === 'initiative') go('/initiatives');
            else go('/council');
          },
        });
      }
    }
    return out;
  }, [q, groups, t, go, onClose, onOpenChat]);

  useEffect(() => { setActive(0); }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] no-print"
         style={{ background: 'var(--sls-surface-overlay, rgba(8,32,27,.45))' }}
         onClick={onClose} role="dialog" aria-modal="true" aria-label="Search and commands">
      <div className="card w-full max-w-xl shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3.5 border-b border-line-subtle">
          <span className="text-ink-disabled" aria-hidden="true">⌕</span>
          <input ref={inputRef} className="flex-1 h-12 bg-transparent text-[14px] outline-none placeholder:text-ink-disabled"
                 placeholder="Search members, events, initiatives — or jump to a page"
                 value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          {loading && <span className="text-[11px] text-ink-muted">…</span>}
          <kbd className="text-[10px] text-ink-muted border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {!items.length ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-muted">
              {q.trim().length < 2 ? 'Type at least two characters.' : `Nothing matches “${q.trim()}”.`}
            </p>
          ) : items.map((it, i) => (
            <button key={it.key} data-active={i === active}
                    onMouseEnter={() => setActive(i)} onClick={it.run}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-start transition-colors ${
                      i === active ? 'bg-brand-soft' : 'hover:bg-surface-sunken'}`}>
              <span className="text-[13px] font-medium text-ink-primary truncate">{it.label}</span>
              {it.hint && <span className="text-[12px] text-ink-muted truncate">{it.hint}</span>}
              {it.badge && <span className="ms-auto text-[10px] uppercase tracking-wide text-ink-muted shrink-0">{it.badge}</span>}
            </button>
          ))}
        </div>

        <div className="px-3.5 py-2 border-t border-line-subtle flex items-center gap-3 text-[11px] text-ink-muted">
          <span><kbd className="border border-line rounded px-1">↑</kbd><kbd className="border border-line rounded px-1 ms-0.5">↓</kbd> navigate</span>
          <span><kbd className="border border-line rounded px-1">↵</kbd> open</span>
          <span className="ms-auto">{items.length} result{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
