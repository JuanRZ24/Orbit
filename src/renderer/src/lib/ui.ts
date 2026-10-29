import type { ItemKind, Issue, IssueType, Priority, Severity, Status, Story, Task } from '../../../shared/types'

export type AnyItem = Story | Task | Issue

export const cn = (...parts: Array<string | number | false | null | undefined>): string =>
  parts.filter((p) => typeof p === 'string' && p).join(' ')

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente'
}
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#64748b', normal: '#38bdf8', high: '#f59e0b', urgent: '#ef4444'
}
export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  bug: 'Bug', enhancement: 'Mejora', question: 'Duda', chore: 'Mantenimiento'
}
export const ISSUE_TYPE_COLOR: Record<IssueType, string> = {
  bug: '#ef4444', enhancement: '#22c55e', question: '#38bdf8', chore: '#94a3b8'
}
export const SEVERITY_LABEL: Record<Severity, string> = {
  wishlist: 'Deseable', minor: 'Menor', normal: 'Normal', important: 'Importante', critical: 'Crítica'
}
export const SEVERITY_COLOR: Record<Severity, string> = {
  wishlist: '#64748b', minor: '#38bdf8', normal: '#22c55e', important: '#f59e0b', critical: '#ef4444'
}
export const KIND_LABEL: Record<ItemKind, string> = {
  story: 'Historia', task: 'Tarea', issue: 'Incidencia'
}

export const refLabel = (prefix: string, ref: number | null | undefined): string =>
  ref == null ? prefix : `${prefix}-${ref}`

export function statusById(statuses: Status[], id: string): Status | undefined {
  return statuses.find((s) => s.id === id)
}

export function statusesOf(statuses: Status[], kind: ItemKind): Status[] {
  return statuses.filter((s) => s.kind === kind).sort((a, b) => a.position - b.position)
}

export const isDone = (statuses: Status[], item: { statusId: string }): boolean =>
  statusById(statuses, item.statusId)?.isClosed === 1

/** Color de texto legible sobre un fondo dado. */
export function readableOn(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0d12' : '#ffffff'
}

export const alpha = (hex: string, pct: number): string =>
  `color-mix(in srgb, ${hex} ${pct}%, transparent)`

const DAY = 86400000

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value)
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'ahora mismo'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return formatDate(value)
}

/** Días que faltan (negativo = vencido). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const target = new Date(date.slice(0, 10) + 'T00:00:00').getTime()
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((target - todayStart) / DAY)
}

export function dueTone(date: string | null | undefined): 'none' | 'soon' | 'late' {
  const d = daysUntil(date)
  if (d == null) return 'none'
  if (d < 0) return 'late'
  if (d <= 2) return 'soon'
  return 'none'
}

export const pointsLabel = (points: number | null | undefined): string =>
  points == null ? '?' : String(points)

export function sumPoints(stories: Story[]): number {
  return stories.reduce((acc, s) => acc + (s.points ?? 0), 0)
}

/** Mueve `activeId` dentro del orden global dejándolo junto a `overId`. */
export function reorderGlobal<T extends { id: string; statusId: string }>(
  items: T[], activeId: string, overId: string | null, targetStatusId: string | null
): string[] {
  const ordered = [...items]
  const from = ordered.findIndex((i) => i.id === activeId)
  if (from < 0) return ordered.map((i) => i.id)
  const [moved] = ordered.splice(from, 1)

  let insertAt = ordered.length
  if (overId && overId !== activeId) {
    const overIdx = ordered.findIndex((i) => i.id === overId)
    if (overIdx >= 0) insertAt = overIdx
  } else if (targetStatusId) {
    const lastOfColumn = ordered.map((i, idx) => ({ i, idx })).filter(({ i }) => i.statusId === targetStatusId).pop()
    insertAt = lastOfColumn ? lastOfColumn.idx + 1 : ordered.length
  }
  ordered.splice(insertAt, 0, moved)
  return ordered.map((i) => i.id)
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export const TAG_PALETTE = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899']

export function tagColor(tags: Array<{ name: string; color: string }>, name: string): string {
  const found = tags.find((t) => t.name === name)
  if (found) return found.color
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

export type { Status }
