import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';

export function Card({ title, subtitle, actions, children, className = '', pad = true }:
  { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-4 pt-3.5 pb-3 border-b border-line-subtle">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold text-ink-primary leading-tight">{title}</h2>}
            {subtitle && <p className="text-[12px] text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0 no-print">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'brand', icon }:
  { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'accent' | 'neutral'; icon?: ReactNode }) {
  const color = tone === 'accent' ? 'text-brand-accent' : tone === 'neutral' ? 'text-ink-primary' : 'text-brand-primary';
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted truncate">{label}</p>
        {icon && <span className="text-ink-disabled shrink-0">{icon}</span>}
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-ink-muted leading-snug">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'warning' | 'serious' | 'critical' | 'info' | 'neutral' | 'brand' }) {
  const map: Record<string, string> = {
    good: 'bg-state-goodSoft text-state-good border-transparent',
    warning: 'bg-state-warningSoft text-state-warning border-transparent',
    serious: 'bg-state-seriousSoft text-state-serious border-transparent',
    critical: 'bg-state-criticalSoft text-state-critical border-transparent',
    info: 'bg-state-infoSoft text-state-info border-transparent',
    brand: 'bg-brand-soft text-brand-primary border-transparent',
    neutral: 'bg-surface-sunken text-ink-secondary border-transparent',
  };
  return <span className={`chip ${map[tone]}`}>{children}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <p className="text-[14px] font-semibold text-ink-secondary">{title}</p>
      {body && <p className="text-[13px] text-ink-muted mt-1.5 max-w-md mx-auto leading-relaxed">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 'h-20' }: { rows?: number; height?: string }) {
  return <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className={`skeleton ${height}`} />)}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card p-4 border-state-critical/30 bg-state-criticalSoft">
      <p className="text-[13px] text-state-critical font-medium">{message}</p>
      {onRetry && <button className="btn-ghost mt-3" onClick={onRetry}>{t.common.retry}</button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
         style={{ background: 'var(--sls-surface-overlay, rgba(8,32,27,.45))' }} onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} shadow-lg my-4`} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button className="btn-quiet" onClick={onClose} aria-label={t.common.close}>✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ options, value, onChange }: { options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex bg-surface-sunken rounded-md p-0.5 gap-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`px-2.5 h-7 rounded text-[12px] font-medium transition-colors ${value === o.value ? 'bg-surface-raised text-ink-primary shadow-xs' : 'text-ink-muted hover:text-ink-secondary'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MultiSelect({ label, options, value, onChange, placeholder }:
  { label: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="relative">
      <label className="label">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="input flex items-center justify-between text-start gap-2">
        <span className={value.length ? 'text-ink-primary truncate' : 'text-ink-disabled'}>
          {value.length ? `${value.length} selected` : (placeholder ?? 'All')}
        </span>
        <span className="text-ink-disabled shrink-0">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto card shadow-md p-1">
            {options.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-sunken cursor-pointer text-[13px]">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)}
                       className="accent-[var(--sls-brand-primary)]" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {!options.length && <p className="px-2 py-2 text-[12px] text-ink-muted">No options</p>}
          </div>
        </>
      )}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button className="btn-ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ }
    }}>{done ? t.common.copied : (label ?? t.common.copy)}</button>
  );
}
