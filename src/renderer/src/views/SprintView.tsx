import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Rocket, Plus, CalendarRange, Lock, CheckCircle2, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Story, Task } from '../../../shared/types'
import { cn, daysUntil, formatDate, isDone, refLabel, statusesOf, sumPoints } from '../lib/ui'
import { Page, StatCard } from '../components/Page'
import { Burndown } from '../components/Burndown'
import { Empty, Labeled, Modal, Select } from '../components/ui'
import { ItemCardBody, SortableCard, type CardItem } from '../components/ItemCard'

function Cell({ id, children, empty }: { id: string; children: ReactNode; empty: boolean }): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef}
      className={cn('min-h-16 space-y-1.5 rounded-lg border border-transparent p-1.5 transition-colors',
        isOver && 'border-brand/40 bg-brand/5', empty && !isOver && 'border-dashed border-line/40')}>
      {children}
    </div>
  )
}

function SprintSettings({ sprintId, onClose }: { sprintId: string; onClose: () => void }): ReactNode {
  const { snap, run } = useStore()
  const sprint = snap?.sprints.find((s) => s.id === sprintId)
  const [name, setName] = useState(sprint?.name ?? '')
  const [goal, setGoal] = useState(sprint?.goal ?? '')
  const [startDate, setStartDate] = useState(sprint?.startDate?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(sprint?.endDate?.slice(0, 10) ?? '')
  if (!sprint) return null

  return (
    <Modal open onClose={onClose} title="Editar sprint" width="max-w-md"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            onClose()
            void run(() => api.updateSprint(sprint.id, {
              name: name.trim() || sprint.name, goal, startDate: startDate || null, endDate: endDate || null
            }), 'Sprint actualizado')
          }}>Guardar</button>
        </>
      }>
      <div className="space-y-3">
        <Labeled label="Nombre"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
        <Labeled label="Objetivo"><input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Inicio"><input type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Labeled>
          <Labeled label="Fin"><input type="date" className="field" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Labeled>
        </div>
      </div>
    </Modal>
  )
}

export function SprintView(): ReactNode {
  const { snap, sprintId, setSprint, setOpenItem, run } = useStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const sprint = useMemo(
    () => snap?.sprints.find((s) => s.id === sprintId) ?? [...(snap?.sprints ?? [])].reverse().find((s) => !s.closed),
    [snap, sprintId]
  )

  if (!snap) return null
  if (!sprint) {
    return (
      <Page title="Sprint" subtitle="Ninguna iteración activa">
        <Empty icon={<Rocket size={26} />} title="No hay sprints todavía"
          hint="Crea uno desde el backlog y arrastra historias dentro." />
      </Page>
    )
  }

  const taskStatuses = statusesOf(snap.statuses, 'task')
  const stories = snap.stories.filter((s) => s.sprintId === sprint.id)
  const sprintTasks = snap.tasks.filter((t) => t.sprintId === sprint.id || stories.some((s) => s.id === t.storyId))
  const loose = sprintTasks.filter((t) => !t.storyId)
  const done = stories.filter((s) => isDone(snap.statuses, s))
  const daysLeft = sprint.endDate ? daysUntil(sprint.endDate) : null
  const activeTask = activeId ? snap.tasks.find((t) => t.id === activeId) : null

  const rows: Array<{ key: string; story: Story | null; tasks: Task[] }> = [
    ...stories.map((s) => ({ key: s.id, story: s, tasks: sprintTasks.filter((t) => t.storyId === s.id) })),
    ...(loose.length > 0 ? [{ key: '__loose__', story: null, tasks: loose }] : [])
  ]

  const onDragEnd = (event: DragEndEvent): void => {
    document.body.classList.remove('dragging-active')
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const movedId = String(active.id)
    const overId = String(over.id)
    let statusId: string | undefined
    let storyId: string | null | undefined
    if (overId.startsWith('cell:')) {
      const [, row, status] = overId.split(':')
      storyId = row === '__loose__' ? null : row
      statusId = status
    } else {
      const overTask = snap.tasks.find((t) => t.id === overId)
      if (!overTask) return
      statusId = overTask.statusId
      storyId = overTask.storyId
    }
    const moved = snap.tasks.find((t) => t.id === movedId)
    if (!moved || !statusId) return
    const patch: Record<string, unknown> = {}
    if (moved.statusId !== statusId) patch.statusId = statusId
    if (storyId !== undefined && (moved.storyId ?? null) !== storyId) patch.storyId = storyId
    if (Object.keys(patch).length === 0) return
    void run(() => api.updateTask(movedId, patch))
  }

  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          {sprint.closed === 1 ? <Lock size={15} className="text-faint" /> : <Rocket size={15} className="text-brand" />}
          {sprint.name}
          <button className="btn btn-ghost px-1.5 py-1 text-faint hover:text-ink" onClick={() => setEditing(true)} aria-label="Editar sprint">
            <Pencil size={13} />
          </button>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-3">
          {sprint.goal && <span className="italic">{sprint.goal}</span>}
          {(sprint.startDate || sprint.endDate) && (
            <span className="inline-flex items-center gap-1">
              <CalendarRange size={11} />{formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
            </span>
          )}
        </span>
      }
      actions={
        <>
          <Select className="w-44" value={sprint.id} onChange={(v) => setSprint(v)}
            options={snap.sprints.map((s) => ({ value: s.id, label: s.closed ? `${s.name} (cerrado)` : s.name }))} />
          <button className="btn" onClick={() => void run(
            () => api.updateSprint(sprint.id, { closed: sprint.closed === 1 ? 0 : 1 }),
            sprint.closed === 1 ? 'Sprint reabierto' : 'Sprint cerrado'
          )}>
            {sprint.closed === 1 ? <><Rocket size={15} /> Reabrir</> : <><CheckCircle2 size={15} /> Cerrar sprint</>}
          </button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
        <StatCard label="Historias" value={`${done.length}/${stories.length}`} />
        <StatCard label="Puntos" value={`${sumPoints(done)}/${sumPoints(stories)}`} />
        <StatCard label="Tareas"
          value={`${sprintTasks.filter((t) => isDone(snap.statuses, t)).length}/${sprintTasks.length}`}
          hint={daysLeft != null ? (daysLeft >= 0 ? `quedan ${daysLeft} días` : `${-daysLeft} días de retraso`) : undefined} />
        <div className="card p-3">
          <div className="h-36"><Burndown sprintId={sprint.id} height={150} /></div>
        </div>
      </div>

      {stories.length === 0 && loose.length === 0 ? (
        <Empty icon={<Rocket size={24} />} title="Este sprint está vacío"
          hint="Vuelve al backlog y arrastra historias dentro del sprint." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={(e) => { setActiveId(String(e.active.id)); document.body.classList.add('dragging-active') }}
          onDragCancel={() => { setActiveId(null); document.body.classList.remove('dragging-active') }}
          onDragEnd={onDragEnd}>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="sticky top-0 z-10 mb-1 grid gap-2 bg-app/95 pb-1 backdrop-blur"
                style={{ gridTemplateColumns: `220px repeat(${taskStatuses.length}, minmax(0, 1fr))` }}>
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Historia</div>
                {taskStatuses.map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}
                  </div>
                ))}
              </div>

              {rows.map(({ key, story, tasks }) => (
                <div key={key} className="mb-2 grid gap-2 border-t border-line pt-2"
                  style={{ gridTemplateColumns: `220px repeat(${taskStatuses.length}, minmax(0, 1fr))` }}>
                  <div className="pr-2">
                    {story ? (
                      <>
                        <button className="block w-full text-left" onClick={() => setOpenItem({ kind: 'story', id: story.id })}>
                          <span className="mr-1.5 font-mono text-[11px] text-faint">{refLabel(snap.project.prefix, story.ref)}</span>
                          <span className={cn('text-[13px]', isDone(snap.statuses, story) && 'text-faint line-through')}>
                            {story.title}
                          </span>
                        </button>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                          <span className="rounded bg-app px-1.5 py-0.5 font-mono">{story.points ?? '?'} pts</span>
                          <span>{tasks.filter((t) => isDone(snap.statuses, t)).length}/{tasks.length} tareas</span>
                        </div>
                        {adding === story.id ? (
                          <input autoFocus className="field mt-1.5 py-1 text-[12px]" placeholder="Nueva tarea"
                            value={draft} onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => { setAdding(null); setDraft('') }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && draft.trim()) {
                                void run(() => api.createTask({ projectId: snap.project.id, title: draft.trim(), storyId: story.id }))
                                setDraft('')
                                setAdding(null)
                              }
                              if (e.key === 'Escape') { setAdding(null); setDraft('') }
                            }} />
                        ) : (
                          <button className="mt-1 inline-flex items-center gap-1 text-[11px] text-faint hover:text-ink"
                            onClick={() => setAdding(story.id)}>
                            <Plus size={11} /> tarea
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-[12px] italic text-faint">Tareas sueltas</p>
                    )}
                  </div>

                  {taskStatuses.map((status) => {
                    const cellTasks = tasks.filter((t) => t.statusId === status.id)
                    return (
                      <Cell key={status.id} id={`cell:${key}:${status.id}`} empty={cellTasks.length === 0}>
                        <SortableContext items={cellTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          {cellTasks.map((t) => (
                            <SortableCard key={t.id} item={t} prefix={snap.project.prefix} epics={snap.epics}
                              tags={snap.tags} onOpen={() => setOpenItem({ kind: 'task', id: t.id })} />
                          ))}
                        </SortableContext>
                      </Cell>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="w-64 rotate-2 rounded-xl border border-brand/50 bg-panel p-2.5 shadow-2xl shadow-black/60">
                <ItemCardBody item={activeTask as unknown as CardItem} prefix={snap.project.prefix}
                  epics={snap.epics} tags={snap.tags} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {editing && <SprintSettings sprintId={sprint.id} onClose={() => setEditing(false)} />}
    </Page>
  )
}
