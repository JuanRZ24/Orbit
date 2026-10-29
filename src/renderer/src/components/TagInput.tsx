import { useState, type ReactNode } from 'react'
import { X, Plus } from 'lucide-react'
import type { Tag } from '../../../shared/types'
import { alpha, tagColor } from '../lib/ui'

export function TagChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4"
      style={{ background: alpha(color, 18), color, border: `1px solid ${alpha(color, 32)}` }}>
      {name}
      {onRemove && (
        <button onClick={onRemove} className="opacity-60 hover:opacity-100" aria-label={`Quitar ${name}`}>
          <X size={10} />
        </button>
      )}
    </span>
  )
}

export function TagInput({ value, known, onChange }: {
  value: string[]
  known: Tag[]
  onChange: (tags: string[]) => void
}): ReactNode {
  const [draft, setDraft] = useState('')
  const suggestions = known
    .filter((t) => !value.includes(t.name) && t.name.toLowerCase().includes(draft.toLowerCase()))
    .slice(0, 6)

  const add = (name: string): void => {
    const clean = name.trim().replace(/^#/, '')
    if (!clean || value.includes(clean)) { setDraft(''); return }
    onChange([...value, clean])
    setDraft('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-app px-2 py-1.5">
        {value.map((name) => (
          <TagChip key={name} name={name} color={tagColor(known, name)}
            onRemove={() => onChange(value.filter((t) => t !== name))} />
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-faint"
          placeholder={value.length ? '' : 'añadir etiqueta…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
        />
      </div>
      {(suggestions.length > 0 || draft) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {draft && !known.some((t) => t.name === draft) && (
            <button className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-1.5 py-0.5 text-[11px] text-dim hover:bg-hover"
              onClick={() => add(draft)}>
              <Plus size={10} /> crear «{draft.trim()}»
            </button>
          )}
          {suggestions.map((t) => (
            <button key={t.name} onClick={() => add(t.name)}>
              <TagChip name={t.name} color={t.color} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
