/**
 * Non-blocking action feedback.
 *
 * Saving a rule or verifying hours used to leave no trace unless a panel happened
 * to re-render — which reads as "did that work?". A toast confirms the action where
 * the eye already is, and gets out of the way.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; tone: 'good' | 'bad' | 'info' };
type Ctx = { toast: (text: string, tone?: Toast['tone']) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'good') => {
    const id = Date.now() + Math.random();
    setItems(list => [...list, { id, text, tone }]);
    window.setTimeout(() => setItems(list => list.filter(t => t.id !== id)), tone === 'bad' ? 6000 : 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 ltr:right-4 rtl:left-4 z-[70] flex flex-col gap-2 no-print pointer-events-none"
           role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id}
               className={`pointer-events-auto card shadow-md px-3.5 py-2.5 text-[13px] max-w-sm animate-[fadeIn_.15s_ease-out] ${
                 t.tone === 'bad' ? 'border-state-critical/40 bg-state-criticalSoft text-state-critical'
                 : t.tone === 'info' ? 'border-state-info/30 bg-state-infoSoft text-state-info'
                 : 'border-state-good/30 bg-state-goodSoft text-state-good'}`}>
            {t.tone === 'bad' ? '✕ ' : t.tone === 'info' ? '· ' : '✓ '}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
