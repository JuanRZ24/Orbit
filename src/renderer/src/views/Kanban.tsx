import { useMemo, type ReactNode } from 'react'
import { Filter, X } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { cn, isDone, statusesOf, sumPoints } from '../lib/ui'
import { Page } from '../components/Page'
import { Board } from '../components/Board'
import { Dropdown, MenuItem, Select } from '../components/ui'

export function Kanban(): ReactNode {
  const { snap, run, setOpenItem, filters, setFilters, resetFilters, boardSprint, setBoardSprint } = useStore()

  const stories = useMemo(() => {
    if (!snap) return []
    const text = filters.text.trim().toLowerCase()
    return snap.stories.filter((s) => {
      if (boardSprint === '__backlog__' && s.sprintId) return false
      if (boardSprint !== '__all__' && boardSprint !== '__backlog__' && s.sprintId !== boardSprint) return false
      if (text && !s.title.toLowerCase().includes(text) && !String(s.ref).includes(text)) return false
      if (filters.epicId && s.epicId !== filters.epicId) return false
      if (filters.tags.length && !filters.tags.every((t) => s.tags.includes(t))) return false
      return true
    })
  }, [snap, filters, boardSprint])

  if (!snap) return null
  const statuses = statusesOf(snap.statuses, 'story')
  const taskCounts = Object.fromEntries(snap.stories.map((s) => {
    const mine = snap.tasks.filter((t) => t.storyId === s.id)
    return [s.id, { done: mine.filter((t) => isDone(snap.statuses, t)).length, total: mine.length }]
  }))
  const hasFilters = !!filters.text || !!filters.epicId || filters.tags.length > 0

  return (
    <Page
      title="Tablero"
      subtitle={`${stories.length} historia(s) · ${sumPoints(stories)} puntos`}
      scroll={false}
      toolbar={
        <>
          <Select className="w-48" value={boardSprint} onChange={(v) => setBoardSprint(v)}
            options={[
              { value: '__all__', label: 'Todas las historias' },
              { value: '__backlog__', label: 'Sólo backlog' },
              ...snap.sprints.map((s) => ({ value: s.id, label: s.name }))
            ]} />
          <div className="relative min-w-44 max-w-xs flex-1">
            <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="field py-1.5 pl-8 text-[13px]" placeholder="Filtrar"
              value={filters.text} onChange={(e) => setFilters({ text: e.target.value })} />
          </div>
          <Select className="w-44" value={filters.epicId ?? ''} onChange={(v) => setFilters({ epicId: v || null })}
            options={[{ value: '', label: 'Todas las épicas' }, ...snap.epics.map((e) => ({ value: e.id, label: e.title }))]} />
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
          {hasFilters && (
            <button className={cn('btn btn-ghost py-1.5 text-[13px] text-faint')} onClick={resetFilters}>
              <X size={13} /> Limpiar
            </button>
          )}
        </>
      }
    >
      <Board
        kind="story"
        items={stories}
        statuses={statuses}
        epics={snap.epics}
        tags={snap.tags}
        prefix={snap.project.prefix}
        showPoints
        epicAccent
        taskCounts={taskCounts}
        onOpen={(id) => setOpenItem({ kind: 'story', id })}
        onQuickAdd={(statusId, title) => void run(() => api.createStory({
          projectId: snap.project.id, title, statusId,
          sprintId: boardSprint !== '__all__' && boardSprint !== '__backlog__' ? boardSprint : undefined,
          epicId: filters.epicId ?? undefined
        }))}
        onMove={(ordered, movedId, statusId) => void run(async () => {
          const moved = snap.stories.find((s) => s.id === movedId)
          if (moved && moved.statusId !== statusId) await api.updateStory(movedId, { statusId })
          await api.reorderStories(ordered)
        })}
      />
    </Page>
  )
}
