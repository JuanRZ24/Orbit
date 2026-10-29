import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn, readableOn, alpha } from '../lib/ui'

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open, onClose, title, subtitle, children, footer, width = 'max-w-2xl'
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-[2px]"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('card pop-in my-6 w-full shadow-2xl shadow-black/50', width)}>
        {(title || subtitle) && (
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="flex-1">
              {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
            </div>
            <button className="btn btn-ghost -mr-2 -mt-1 px-2" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </header>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

/* ------------------------------------------------------------- Confirmar */

export function Confirm({
  open, title, message, confirmLabel = 'Eliminar', danger = true, onConfirm, onClose
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): ReactNode {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </>
      }>
      <p className="text-sm text-dim">{message}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ Badge */

export function Badge({ color, children, soft = true, className }: {
  color: string
  children: ReactNode
  soft?: boolean
  className?: string
}): ReactNode {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4', className)}
      style={soft
        ? { background: alpha(color, 18), color, border: `1px solid ${alpha(color, 32)}` }
        : { background: color, color: readableOn(color) }}
    >
      {children}
    </span>
  )
}

export function Dot({ color, size = 8 }: { color: string; size?: number }): ReactNode {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
}

/* ----------------------------------------------------------------- Campos */

export function Labeled({ label, hint, children, className }: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}): ReactNode {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

export function Select<T extends string>({ value, onChange, options, className }: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  className?: string
}): ReactNode {
  return (
    <div className={cn('relative', className)}>
      <select
        className="field appearance-none pr-8"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  )
}

/* --------------------------------------------------------------- Dropdown */

export function Dropdown({ trigger, children, align = 'left', width = 220 }: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: number
}): ReactNode {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className="card pop-in absolute z-40 mt-1 max-h-80 overflow-y-auto p-1 shadow-xl shadow-black/50"
          style={{ width, [align]: 0 } as React.CSSProperties}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ children, onClick, active, danger, icon }: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  danger?: boolean
  icon?: ReactNode
}): ReactNode {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
        danger ? 'text-red-300 hover:bg-red-950/50' : 'hover:bg-hover',
        active && 'bg-hover'
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {active && <Check size={14} className="text-brand" />}
    </button>
  )
}

/* ------------------------------------------------------------- Inline edit */

export function InlineText({ value, onCommit, className, placeholder, multiline }: {
  value: string
  onCommit: (next: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
}): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onCommit(next)
    else setDraft(value)
  }

  if (!editing) {
    return (
      <span
        className={cn('cursor-text rounded px-1 -mx-1 hover:bg-hover', !value && 'text-faint', className)}
        onDoubleClick={() => setEditing(true)}
        title="Doble clic para editar"
      >
        {value || placeholder}
      </span>
    )
  }
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <Tag
      autoFocus
      className={cn('field', className)}
      value={draft}
      rows={multiline ? 3 : undefined}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
    />
  )
}

/* ------------------------------------------------------------- Markdown */

export function Markdown({ children, className }: { children: string; className?: string }): ReactNode {
  return (
    <div className={cn(
      'text-[13px] leading-relaxed text-dim',
      '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-ink',
      '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink',
      '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-ink',
      '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
      '[&_li]:my-0.5 [&_a]:text-brand [&_a]:underline [&_strong]:text-ink [&_strong]:font-semibold',
      '[&_code]:rounded [&_code]:bg-app [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-ink',
      '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-app [&_pre]:p-3',
      '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
      '[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-faint',
      '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse',
      '[&_th]:border [&_th]:border-line [&_th]:bg-raise [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-ink',
      '[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1',
      '[&_hr]:my-4 [&_hr]:border-line',
      '[&_input[type=checkbox]]:mr-1.5',
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

/* ----------------------------------------------------------------- Vacío */

export function Empty({ icon, title, hint, action }: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-xs text-faint">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/* --------------------------------------------------------------- Progreso */

export function Progress({ value, total, color = '#22c55e', className }: {
  value: number
  total: number
  color?: string
  className?: string
}): ReactNode {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-app', className)}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
