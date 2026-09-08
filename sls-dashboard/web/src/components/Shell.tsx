import { useState, type ReactNode } from 'react';
import { useApp } from '../state';
import { useI18n } from '../i18n';

const NAV: Array<{ id: string; route: string; icon: string; group: 1 | 2 | 3 }> = [
  { id: 'overview',    route: '/overview',    icon: '◈', group: 1 },
  { id: 'members',     route: '/members',     icon: '⬢', group: 1 },
  { id: 'engagement',  route: '/engagement',  icon: '◷', group: 1 },
  { id: 'initiatives', route: '/initiatives', icon: '❖', group: 1 },
  { id: 'impact',      route: '/impact',      icon: '▲', group: 1 },
  { id: 'social',      route: '/social',      icon: '◎', group: 2 },
  { id: 'ai',          route: '/ai',          icon: '✦', group: 2 },
  { id: 'exports',     route: '/exports',     icon: '⇩', group: 2 },
  { id: 'ingest',      route: '/ingest',      icon: '⇧', group: 2 },
  { id: 'council',     route: '/council',     icon: '⬡', group: 3 },
  { id: 'settings',    route: '/settings',    icon: '⚙', group: 3 },
];

export function Shell({ children, onOpenChat }: { children: ReactNode; onOpenChat: () => void }) {
  const { route, navigate, aiReady } = useApp();
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);

  const item = (n: typeof NAV[number]) => {
    const active = route === n.route || route.startsWith(`${n.route}/`);
    return (
      <button key={n.id} onClick={() => { navigate(n.route); setOpen(false); }}
        className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-[13px] font-medium transition-colors text-start
          ${active ? 'bg-white/15 text-white' : 'text-[color:var(--sls-ink-onInverseMuted)] hover:bg-white/8 hover:text-white'}`}>
        <span className="w-4 text-center opacity-80 shrink-0">{n.icon}</span>
        <span className="truncate">{(t.nav as any)[n.id]}</span>
      </button>
    );
  };

  return (
    <div className="min-h-full flex" style={{ background: 'var(--sls-surface-canvas)' }}>
      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 z-40 h-screen shrink-0 flex flex-col transition-transform duration-200 no-print
          ${open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'} lg:!translate-x-0`}
        style={{ width: 'var(--sls-layout-sidebarWidth, 248px)', background: 'var(--sls-brand-primary)' }}>
        <div className="px-4 pt-5 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--sls-brand-accent)' }}>Misk Foundation</p>
          <h1 className="text-white text-[15px] font-bold leading-tight mt-1">{t.org}</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--sls-ink-onInverseMuted)' }}>{t.appName}</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 space-y-0.5">
          {NAV.filter(n => n.group === 1).map(item)}
          <div className="h-px bg-white/12 my-2.5 mx-2" />
          {NAV.filter(n => n.group === 2).map(item)}
          <div className="h-px bg-white/12 my-2.5 mx-2" />
          {NAV.filter(n => n.group === 3).map(item)}
        </nav>
        <div className="p-2.5 border-t border-white/12">
          <button onClick={onOpenChat}
            className="w-full flex items-center gap-2 px-3 h-9 rounded-md text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--sls-brand-accent)', color: '#fff' }}>
            <span>✦</span><span className="truncate">{t.ai.title}</span>
            {!aiReady && <span className="ms-auto text-[10px] px-1.5 py-0.5 rounded bg-black/25">off</span>}
          </button>
          <p className="text-[10px] mt-2 px-1 leading-snug" style={{ color: 'var(--sls-ink-onInverseMuted)' }}>
            Grow to Great · Connect to Create · Lead with Impact
          </p>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-surface-raised/95 backdrop-blur border-b border-line-subtle no-print"
                style={{ height: 'var(--sls-layout-topbarHeight, 60px)' }}>
          <div className="h-full px-4 flex items-center gap-3">
            <button className="btn-quiet lg:hidden" onClick={() => setOpen(o => !o)} aria-label="Menu">☰</button>
            <h2 className="text-[15px] font-semibold text-ink-primary truncate">
              {(t.nav as any)[NAV.find(n => route.startsWith(n.route))?.id ?? 'overview']}
            </h2>
            <div className="ms-auto flex items-center gap-2">
              {!aiReady && (
                <button onClick={() => navigate('/settings')} className="chip bg-state-warningSoft text-state-warning border-transparent">
                  ✦ {t.ai.keyMissing}
                </button>
              )}
              <div className="inline-flex bg-surface-sunken rounded-md p-0.5 gap-0.5">
                {(['en', 'ar'] as const).map(l => (
                  <button key={l} onClick={() => setLang(l)}
                    className={`px-2.5 h-7 rounded text-[12px] font-medium ${lang === l ? 'bg-surface-raised text-ink-primary shadow-xs' : 'text-ink-muted'}`}>
                    {t.lang[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 w-full mx-auto" style={{ maxWidth: 'var(--sls-layout-contentMaxWidth, 1560px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
