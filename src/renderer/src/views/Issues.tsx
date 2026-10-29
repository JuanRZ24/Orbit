import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Filter, X, Columns3, Rows3, Trash2, MoreHorizontal } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { ISSUE_TYPES, SEVERITIES, type IssueType } from '../../../shared/types'
import {
  cn, ISSUE_TYPE_COLOR, ISSUE_TYPE_LABEL, PRIORITY_COLOR, PRIORITY_LABEL, SEVERITY_COLOR,
  SEVERITY_LABEL, dueTone, formatDate, isDone, refLabel, statusesOf, tagColor
} from '../lib/ui'
import { Page } from '../components/Page'
import { Board } from '../components/Board'
import { Badge, Dropdown, Empty, MenuItem, Select } from '../components/ui'
import { TagChip } from '../components/TagInput'

export function Issues(): ReactNode {
  const { snap, run, setOpenItem, filters, setFilters, resetFilters } = useStore()
  const [mode, setMode] = useState<'list' | 'board'>('list')
  const [type, setType] = useState<IssueType | ''>('')
  const [quickAdd, setQuickAdd] = useState('')

  const issues = useMemo(() => {
    if (!snap) return []
    const text = filters.text.trim().toLowerCase()
    return snap.issues.filter((i) => {
      if (type && i.type !== type) return false
      if (text && !i.title.toLowerCase().includes(text) && !String(i.ref).includes(text)) return false
      if (filters.tags.length && !filters.tags.every((t) => i.tags.includes(t))) return false
      if (filters.hideClosed && isDone(snap.statuses, i)) return false
      return true
    })
  }, [snap, filters, type])

  if (!snap) return null
  const statuses = statusesOf(snap.statuses, 'issue')
  const open = issues.filter((i) => !isDone(snap.statuses, i))
  const hasFilters = !!filters.text || filters.tags.length > 0 || !!type || filters.hideClosed

  const add = (): void => {
    const title = quickAdd.trim()
    if (!title) return
    setQuickAdd('')
    void run(() => api.createIssue({ projectId: snap.project.id, title, type: type || 'bug', tags: filters.tags }))
  }

  return (
    <Page
      title="Incidencias"
      subtitle={`${open.length} abierta(s) de ${issues.length}`}
      scroll={mode === 'list'}
      actions={
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button className={cn('px-2.5 py-1.5', mode === 'list' ? 'bg-hover text-ink' : 'text-faint hover:bg-hover')}
            onClick={() => setMode('list')} title="Lista"><Rows3 size={15} /></button>
          <button className={cn('px-2.5 py-1.5', mode === 'board' ? 'bg-hover text-ink' : 'text-faint hover:bg-hover')}
            onClick={() => setMode('board')} title="Tablero"><Columns3 size={15} /></button>
        </div>
      }
      toolbar={
        <>
          <div className="relative min-w-44 max-w-xs flex-1">
            <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="field py-1.5 pl-8 text-[13px]" placeholder="Filtrar"
              value={filters.text} onChange={(e) => setFilters({ text: e.target.value })} />
          </div>
          <Select className="w-40" value={type} onChange={(v) => setType(v as IssueType | '')}
            options={[{ value: '', label: 'Todos los tipos' }, ...ISSUE_TYPES.map((t) => ({ value: t, label: ISSUE_TYPE_LABEL[t] }))]} />
          {snap.tags.length > 0 && (
            <Dropdown width={200} trigger={({ toggle }) => (
              <button className="btn py-1.5 text-[13px]" onClick={toggle}>
                Etiquetas {filters.tags.length > 0 && <span className="font-mono text-brand">{filters.tags.length}</span>}
              </button>
            )}>
              {() => (
                <>
                  {snap.tags.map((t) => (
                    <MenuItem key={t.name} active={filters.tags.includes(t.name)}
                      icon={<span className="h-2 w-2 rounded-full" style={{ background: t.color }} />}
                      onClick={() => setFilters({
                        tags: filters.tags.includes(t.name) ? filters.tags.filter((x) => x !== t.name) : [...filters.tags, t.name]
                      })}>
                      {t.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          )}
          <button className={cn('btn py-1.5 text-[13px]', filters.hideClosed && 'border-brand text-brand')}
            onClick={() => setFilters({ hideClosed: !filters.hideClosed })}>Ocultar cerradas</button>
          {hasFilters && (
            <button className="btn btn-ghost py-1.5 text-[13px] text-faint"
              onClick={() => { resetFilters(); setType('') }}><X size={13} /> Limpiar</button>
          )}
        </>
      }
    >
      {mode === 'board' ? (
        <Board
          kind="issue"
          items={issues}
          statuses={statuses}
          epics={snap.epics}
          tags={snap.tags}
          prefix={snap.project.prefix}
          onOpen={(id) => setOpenItem({ kind: 'issue', id })}
          onQuickAdd={(statusId, title) => void run(() => api.createIssue({
            projectId: snap.project.id, title, statusId, type: type || 'bug'
          }))}
          onMove={(ordered, movedId, statusId) => void run(async () => {
            const moved = snap.issues.find((i) => i.id === movedId)
            if (moved && moved.statusId !== statusId) await api.updateIssue(movedId, { statusId })
            await api.reorderIssues(ordered)
          })}
        />
      ) : (
        <>
          <form className="mb-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
            <Plus size={15} className="shrink-0 text-faint" />
            <input className="field py-1.5 text-[13px]" placeholder="Nueva incidencia… (Enter para añadir)"
              value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} />
          </form>

          {issues.length === 0 ? (
            <Empty title={hasFilters ? 'Nada coincide con el filtro' : 'Sin incidencias'}
              hint={hasFilters ? undefined : 'Aquí van los bugs, dudas y mejoras que no entran en el backlog.'} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <thead>
                  <tr className="bg-panel text-[11px] uppercase tracking-wide text-faint">
                    <th className="w-20 px-3 py-2 text-left font-semibold">Ref</th>
                    <th className="px-3 py-2 text-left font-semibold">Título</th>
                    <th className="hidden w-28 px-3 py-2 text-left font-semibold md:table-cell">Tipo</th>
                    <th className="hidden w-32 px-3 py-2 text-left font-semibold lg:table-cell">Severidad</th>
                    <th className="hidden w-28 px-3 py-2 text-left font-semibold lg:table-cell">Prioridad</th>
                    <th className="w-36 px-3 py-2 text-left font-semibold">Estado</th>
                    <th className="hidden w-28 px-3 py-2 text-left font-semibold xl:table-cell">Fecha</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => {
                    const status = statuses.find((s) => s.id === issue.statusId)
                    const tone = dueTone(issue.dueDate)
                    return (
                      <tr key={issue.id} className="group border-t border-line bg-app/40 hover:bg-hover/50">
                        <td className="px-3 py-2 font-mono text-[11px] text-faint">{refLabel(snap.project.prefix, issue.ref)}</td>
                        <td className="px-3 py-2">
                          <button className={cn('block w-full truncate text-left',
                            isDone(snap.statuses, issue) && 'text-faint line-through')}
                            onClick={() => setOpenItem({ kind: 'issue', id: issue.id })}>
                            {issue.title}
                          </button>
                          {issue.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {issue.tags.map((t) => <TagChip key={t} name={t} color={tagColor(snap.tags, t)} />)}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 md:table-cell">
                          <Badge color={ISSUE_TYPE_COLOR[issue.type]}>{ISSUE_TYPE_LABEL[issue.type]}</Badge>
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-dim">
                            <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[issue.severity] }} />
                            {SEVERITY_LABEL[issue.severity]}
                          </span>
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-dim">
                            <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[issue.priority] }} />
                            {PRIORITY_LABEL[issue.priority]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Dropdown width={190} trigger={({ toggle }) => (
                            <button onClick={toggle} className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-hover">
                              <span className="h-2 w-2 rounded-full" style={{ background: status?.color ?? '#555' }} />
                              {status?.name ?? '—'}
                            </button>
                          )}>
                            {(close) => (
                              <>
                                {statuses.map((s) => (
                                  <MenuItem key={s.id} active={s.id === issue.statusId}
                                    icon={<span className="h-2 w-2 rounded-full" style={{ background: s.color }} />}
                                    onClick={() => { void run(() => api.updateIssue(issue.id, { statusId: s.id })); close() }}>
                                    {s.name}
                                  </MenuItem>
                                ))}
                              </>
                            )}
                          </Dropdown>
                        </td>
                        <td className={cn('hidden px-3 py-2 text-[12px] xl:table-cell',
                          tone === 'late' ? 'text-red-400' : tone === 'soon' ? 'text-amber-400' : 'text-faint')}>
                          {issue.dueDate ? formatDate(issue.dueDate) : '—'}
                        </td>
                        <td className="px-1 py-2">
                          <Dropdown align="right" width={200} trigger={({ toggle }) => (
                            <button onClick={toggle} className="rounded p-1 text-faint opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100">
                              <MoreHorizontal size={14} />
                            </button>
                          )}>
                            {(close) => (
                              <>
                                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase text-faint">Severidad</p>
                                {SEVERITIES.map((s) => (
                                  <MenuItem key={s} active={s === issue.severity}
                                    icon={<span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />}
                                    onClick={() => { void run(() => api.updateIssue(issue.id, { severity: s })); close() }}>
                                    {SEVERITY_LABEL[s]}
                                  </MenuItem>
                                ))}
                                <div className="my-1 h-px bg-line" />
                                <MenuItem danger icon={<Trash2 size={14} />}
                                  onClick={() => { void run(() => api.removeIssue(issue.id), 'Incidencia eliminada'); close() }}>
                                  Eliminar
                                </MenuItem>
                              </>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Page>
  )
}
