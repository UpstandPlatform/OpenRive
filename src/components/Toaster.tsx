'use client';
import { useToasts } from '@/lib/client/toast';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="px-3 py-2 rounded-md bg-bg3 border border-line text-t0 text-[12px] shadow-lg">
          {t.text}
        </div>
      ))}
    </div>
  );
}
