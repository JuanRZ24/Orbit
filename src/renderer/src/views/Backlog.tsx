import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, GripVertical, Rocket, CalendarRange, MoreHorizontal, Trash2, Lock, Unlock,
  Filter, X, Ban, CheckCircle2
} from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Sprint, Story } from '../../../shared/types'
import {
  cn, alpha, dueTone, formatDate, isDone, pointsLabel, refLabel, statusesOf, sumPoints, tagColor
} from '../lib/ui'
import { Page } from '../components/Page'
import { Confirm, Dropdown, Empty, MenuItem, Progress, Select } from '../components/ui'
import { TagChip } from '../components/TagInput'

const BACKLOG = 'container:backlog'
const sprintContainer = (id: string): string => `container:sprint:${id}`

function Row({ story, prefix, overlay }: { story: Story; prefix: string; overlay?: boolean }): ReactNode {
  const { snap, setOpenItem, run } = useStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: story.id })
  if (!snap) return null

  const statuses = statusesOf(snap.statuses, 'story')
  const status = statuses.find((s) => s.id === story.statusId)
  const epic = story.epicId ? snap.epics.find((e) => e.id === story.epicId) : null
  const done = isDone(snap.statuses, story)
  const tone = dueTone(story.dueDate)
  const subtasks = snap.tasks.filter((t) => t.storyId === story.id)

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5',
        overlay && 'w-[640px] rotate-1 shadow-2xl shadow-black/60',
        !overlay && 'hover:border-faint/50'
      )}
    >
      <button className="cursor-grab text-faint opacity-40 hover:opacity-100 active:cursor-grabbing"
        {...attributes} {...listeners} aria-label="Reordenar">
        <GripVertical size={14} />
      </button>

      <span className="shrink-0 font-mono text-[11px] text-faint">{refLabel(prefix, story.ref)}</span>

      {status && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.color }} title={status.name} />
      )}

      <button className={cn('min-w-0 flex-1 truncate text-left text-[13px]', done && 'text-faint line-through')}
        onClick={() => setOpenItem({ kind: 'story', id: story.id })}>
        {story.blocked === 1 && <Ban size={12} className="mr-1 inline text-red-400" />}
        {story.title}
      </button>

      {epic && (
        <span className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] lg:inline"
          style={{ background: alpha(epic.color, 16), color: epic.color }}>{epic.title}</span>
      )}

      {story.tags.slice(0, 2).map((t) => (
        <span key={t} className="hidden xl:inline"><TagChip name={t} color={tagColor(snap.tags, t)} /></span>
      ))}

      {subtasks.length > 0 && (
        <span className="hidden shrink-0 font-mono text-[11px] text-faint sm:inline">
          {subtasks.filter((t) => isDone(snap.statuses, t)).length}/{subtasks.length}
        </span>
      )}

      {story.dueDate && (
        <span className={cn('hidden shrink-0 text-[11px] md:inline',
          tone === 'late' ? 'text-red-400' : tone === 'soon' ? 'text-amber-400' : 'text-faint')}>
          {formatDate(story.dueDate)}
        </span>
      )}

      <Dropdown align="right" width={120}
        trigger={({ toggle }) => (
          <button onClick={toggle}
            className="shrink-0 rounded bg-app px-1.5 py-0.5 font-mono text-[11px] text-dim hover:bg-hover" title="Puntos">
            {pointsLabel(story.points)}
          </button>
        )}>
        {(close) => (
          <>
            {[null, 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40].map((p) => (
              <MenuItem key={String(p)} active={story.points === p}
                onClick={() => { void run(() => api.updateStory(story.id, { points: p })); close() }}>
                {pointsLabel(p)}
              </MenuItem>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown align="right" width={210}
        trigger={({ toggle }) => (
          <button onClick={toggle} className="shrink-0 rounded p-1 text-faint opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100">
            <MoreHorizontal size={14} />
          </button>
        )}>
        {(close) => (
          <>
            <p className="px-2.5 py-1 text-[11px] font-semibold uppercase text-faint">Estado</p>
            {statuses.map((s) => (
              <MenuItem key={s.id} active={s.id === story.statusId}
                icon={<span className="h-2 w-2 rounded-full" style={{ background: s.color }} />}
                onClick={() => { void run(() => api.updateStory(story.id, { statusId: s.id })); close() }}>
                {s.name}
              </MenuItem>
            ))}
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<Ban size={14} />}
              onClick={() => { void run(() => api.updateStory(story.id, { blocked: story.blocked === 1 ? 0 : 1 })); close() }}>
              {story.blocked === 1 ? 'Desbloquear' : 'Bloquear'}
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={14} />}
              onClick={() => { void run(() => api.removeStory(story.id), 'Historia eliminada'); close() }}>
              Eliminar
            </MenuItem>
          </>
        )}
      </Dropdown>
    </div>
  )
}

function DropZone({ id, children, className }: { id: string; children: ReactNode; className?: string }): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('rounded-xl transition-colors', isOver && 'bg-brand/5 ring-1 ring-brand/40', className)}>
      {children}
    </div>
  )
}

function SprintCard({ sprint, stories, prefix }: { sprint: Sprint; stories: Story[]; prefix: string }): ReactNode {
  const { snap, run, setView, setSprint } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!snap) return null
  const done = stories.filter((s) => isDone(snap.statuses, s))
  const total = sumPoints(stories)

  return (
    <div className={cn('card p-3', sprint.closed === 1 && 'opacity-60')}>
      <header className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
            {sprint.closed === 1 ? <Lock size={12} className="text-faint" /> : <Rocket size={12} className="text-brand" />}
            {sprint.name}
          </h3>
          {(sprint.startDate || sprint.endDate) && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
              <CalendarRange size={11} />
              {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
            </p>
          )}
        </div>
        <Dropdown align="right" width={200}
          trigger={({ toggle }) => (
            <button onClick={toggle} className="rounded p-1 text-faint hover:bg-hover hover:text-ink">
              <MoreHorizontal size={14} />
            </button>
          )}>
          {(close) => (
            <>
              <MenuItem icon={<Rocket size={14} />} onClick={() => { setSprint(sprint.id); setView('sprint'); close() }}>
                Abrir taskboard
              </MenuItem>
              <MenuItem icon={sprint.closed === 1 ? <Unlock size={14} /> : <CheckCircle2 size={14} />}
                onClick={() => {
                  void run(() => api.updateSprint(sprint.id, { closed: sprint.closed === 1 ? 0 : 1 }),
                    sprint.closed === 1 ? 'Sprint reabierto' : 'Sprint cerrado')
                  close()
                }}>
                {sprint.closed === 1 ? 'Reabrir sprint' : 'Cerrar sprint'}
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem danger icon={<Trash2 size={14} />} onClick={() => { setConfirmDelete(true); close() }}>
                Eliminar sprint
              </MenuItem>
            </>
          )}
        </Dropdown>
      </header>

      {sprint.goal && <p className="mb-2 text-[11px] italic text-faint">{sprint.goal}</p>}

      <div className="mb-2 flex items-baseline justify-between text-[11px]">
        <span className="text-faint">{done.length}/{stories.length} historias</span>
        <span className="font-mono text-dim">{sumPoints(done)}/{total} pts</span>
      </div>
      <Progress value={sumPoints(done)} total={total} className="mb-2.5" />

      <DropZone id={sprintContainer(sprint.id)} className="min-h-14 space-y-1 p-0.5">
        <SortableContext items={stories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {stories.map((s) => <Row key={s.id} story={s} prefix={prefix} />)}
        </SortableContext>
        {stories.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-faint">
            Arrastra historias aquí
          </p>
        )}
      </DropZone>

      <Confirm open={confirmDelete} title="Eliminar sprint"
        message={<>Las {stories.length} historia(s) volverán al backlog.</>}
        onConfirm={() => void run(() => api.removeSprint(sprint.id), 'Sprint eliminado')}
        onClose={() => setConfirmDelete(false)} />
    </div>
  )
}

function NewSprintForm({ onDone }: { onDone: () => void }): ReactNode {
  const { snap, run } = useStore()
  const nextNumber = (snap?.sprints.length ?? 0) + 1
  const [name, setName] = useState(`Sprint ${nextNumber}`)
  const [goal, setGoal] = useState('')
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 13)
  const [startDate, setStartDate] = useState(start.toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(end.toISOString().slice(0, 10))

  return (
    <form
      className="card space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!snap || !name.trim()) return
        void run(() => api.createSprint({ projectId: snap.project.id, name: name.trim(), goal, startDate, endDate }), 'Sprint creado')
        onDone()
      }}
    >
      <input autoFocus className="field text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
      <input className="field text-[13px]" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Objetivo (opcional)" />
      <div className="flex gap-2">
        <input type="date" className="field text-[12px]" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" className="field text-[12px]" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn text-[13px]" onClick={onDone}>Cancelar</button>
        <button className="btn btn-primary text-[13px]">Crear</button>
      </div>
    </form>
  )
}

export function Backlog(): ReactNode {
  const { snap, run, filters, setFilters, resetFilters } = useStore()
  const [quickAdd, setQuickAdd] = useState('')
  const [newSprint, setNewSprint] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showClosedSprints, setShowClosedSprints] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const filtered = useMemo(() => {
    if (!snap) return []
    const text = filters.text.trim().toLowerCase()
    return snap.stories.filter((s) => {
      if (text && !s.title.toLowerCase().includes(text) && !String(s.ref).includes(text)) return false
      if (filters.epicId && s.epicId !== filters.epicId) return false
      if (filters.tags.length && !filters.tags.every((t) => s.tags.includes(t))) return false
      if (filters.hideClosed && isDone(snap.statuses, s)) return false
      return true
    })
  }, [snap, filters])

  if (!snap) return null
  const { project, sprints } = snap
  const backlogStories = filtered.filter((s) => !s.sprintId)
  const visibleSprints = sprints.filter((s) => showClosedSprints || !s.closed)
  const activeStory = activeId ? snap.stories.find((s) => s.id === activeId) : null
  const hasFilters = !!filters.text || !!filters.epicId || filters.tags.length > 0 || filters.hideClosed

  const containerOf = (id: string): string => {
    const story = snap.stories.find((s) => s.id === id)
    if (!story) return BACKLOG
    return story.sprintId ? sprintContainer(story.sprintId) : BACKLOG
  }

  const onDragEnd = (event: DragEndEvent): void => {
    document.body.classList.remove('dragging-active')
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const movedId = String(active.id)
    const overId = String(over.id)
    const destination = overId.startsWith('container:') ? overId : containerOf(overId)
    const targetSprint = destination === BACKLOG ? null : destination.replace('container:sprint:', '')
    const moved = snap.stories.find((s) => s.id === movedId)
    if (!moved) return

    // Orden global nuevo: se saca la historia y se vuelve a insertar junto a la de destino.
    const ordered = snap.stories.map((s) => s.id)
    const from = ordered.indexOf(movedId)
    ordered.splice(from, 1)
    let insertAt = ordered.length
    if (!overId.startsWith('container:')) {
      const idx = ordered.indexOf(overId)
      if (idx >= 0) insertAt = idx
    } else {
      const group = snap.stories.filter((s) => (targetSprint ? s.sprintId === targetSprint : !s.sprintId) && s.id !== movedId)
      const last = group[group.length - 1]
      insertAt = last ? ordered.indexOf(last.id) + 1 : ordered.length
    }
    ordered.splice(insertAt, 0, movedId)

    const sprintChanged = (moved.sprintId ?? null) !== targetSprint
    void run(async () => {
      if (sprintChanged) await api.updateStory(movedId, { sprintId: targetSprint })
      await api.reorderStories(ordered)
    })
  }

  const addStory = (): void => {
    const title = quickAdd.trim()
    if (!title) return
    setQuickAdd('')
    void run(() => api.createStory({ projectId: project.id, title, epicId: filters.epicId ?? undefined, tags: filters.tags }))
  }

  return (
    <Page
      title="Backlog"
      subtitle={`${backlogStories.length} historia(s) sin sprint · ${sumPoints(backlogStories)} puntos`}
      actions={
        <button className="btn btn-primary" onClick={() => setNewSprint(true)}>
          <Plus size={15} /> Nuevo sprint
        </button>
      }
      toolbar={
        <>
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="field py-1.5 pl-8 text-[13px]" placeholder="Filtrar por título o ref"
              value={filters.text} onChange={(e) => setFilters({ text: e.target.value })} />
          </div>
          <Select className="w-44" value={filters.epicId ?? ''}
            onChange={(v) => setFilters({ epicId: v || null })}
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
                        tags: filters.tags.includes(t.name)
                          ? filters.tags.filter((x) => x !== t.name)
                          : [...filters.tags, t.name]
                      })}>
                      {t.name}
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          )}
          <button className={cn('btn py-1.5 text-[13px]', filters.hideClosed && 'border-brand text-brand')}
            onClick={() => setFilters({ hideClosed: !filters.hideClosed })}>
            Ocultar hechas
          </button>
          {hasFilters && (
            <button className="btn btn-ghost py-1.5 text-[13px] text-faint" onClick={resetFilters}>
              <X size={13} /> Limpiar
            </button>
          )}
        </>
      }
      scroll={false}
    >
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => { setActiveId(String(e.active.id)); document.body.classList.add('dragging-active') }}
        onDragCancel={() => { setActiveId(null); document.body.classList.remove('dragging-active') }}
        onDragEnd={onDragEnd}>
        <div className="grid h-full gap-4 overflow-hidden lg:grid-cols-[1fr_340px]">
          <div className="flex h-full flex-col overflow-hidden">
            <form className="mb-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); addStory() }}>
              <Plus size={15} className="shrink-0 text-faint" />
              <input className="field py-1.5 text-[13px]" placeholder="Nueva historia… (Enter para añadir)"
                value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} />
            </form>

            <DropZone id={BACKLOG} className="flex-1 space-y-1 overflow-y-auto p-0.5">
              <SortableContext items={backlogStories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {backlogStories.map((s) => <Row key={s.id} story={s} prefix={project.prefix} />)}
              </SortableContext>
              {backlogStories.length === 0 && (
                <Empty title={hasFilters ? 'Nada coincide con el filtro' : 'El backlog está vacío'}
                  hint={hasFilters ? undefined : 'Escribe arriba para añadir tu primera historia.'} />
              )}
            </DropZone>
          </div>

          <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
            {newSprint && <NewSprintForm onDone={() => setNewSprint(false)} />}
            {visibleSprints.map((sprint) => (
              <SprintCard key={sprint.id} sprint={sprint} prefix={project.prefix}
                stories={filtered.filter((s) => s.sprintId === sprint.id)} />
            ))}
            {sprints.some((s) => s.closed === 1) && (
              <button className="btn btn-ghost justify-center text-[12px] text-faint"
                onClick={() => setShowClosedSprints((v) => !v)}>
                {showClosedSprints ? 'Ocultar' : 'Ver'} sprints cerrados ({sprints.filter((s) => s.closed === 1).length})
              </button>
            )}
            {sprints.length === 0 && !newSprint && (
              <Empty icon={<Rocket size={22} />} title="Sin sprints"
                hint="Agrupa historias en sprints para planificar por iteraciones."
                action={<button className="btn btn-primary" onClick={() => setNewSprint(true)}>Crear sprint</button>} />
            )}
          </div>
        </div>

        <DragOverlay>
          {activeStory && <Row story={activeStory} prefix={project.prefix} overlay />}
        </DragOverlay>
      </DndContext>
    </Page>
  )
}
