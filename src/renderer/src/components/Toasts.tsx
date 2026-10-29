import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useStore } from '../store/useStore'

const ICONS = {
  ok: <CheckCircle2 size={16} className="text-emerald-400" />,
  error: <AlertTriangle size={16} className="text-red-400" />,
  info: <Info size={16} className="text-sky-400" />
}

export function Toasts(): ReactNode {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  if (toasts.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className="card pop-in pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 shadow-xl shadow-black/50">
          {ICONS[t.kind]}
          <p className="flex-1 text-[13px] leading-snug">{t.message}</p>
          <button className="text-faint hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
