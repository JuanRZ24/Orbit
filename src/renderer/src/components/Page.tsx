import type { ReactNode } from 'react'
import { cn } from '../lib/ui'

export function Page({ title, subtitle, actions, toolbar, children, scroll = true }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  scroll?: boolean
}): ReactNode {
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line px-6 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <div className="mt-0.5 text-[12px] text-faint">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {toolbar && <div className="mt-3 flex flex-wrap items-center gap-2">{toolbar}</div>}
      </header>
      <div className={cn('flex-1 px-6 py-4', scroll ? 'overflow-y-auto' : 'overflow-hidden')}>{children}</div>
    </div>
  )
}

export function StatCard({ label, value, hint, color, icon }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  color?: string
  icon?: ReactNode
}): ReactNode {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {icon}<span>{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight" style={color ? { color } : undefined}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-faint">{hint}</p>}
    </div>
  )
}
