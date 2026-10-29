import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Trash2, Ban, Plus, Check, Eye, Pencil, Send, CornerDownRight, Link2
} from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Comment, Issue, ItemKind, Story, Task } from '../../../shared/types'
import { ISSUE_TYPES, PRIORITIES, POINT_SCALE, SEVERITIES } from '../../../shared/types'
import {
  cn, ISSUE_TYPE_LABEL, KIND_LABEL, PRIORITY_LABEL, SEVERITY_LABEL, formatRelative,
  pointsLabel, refLabel, statusesOf
} from '../lib/ui'
import { Badge, Confirm, Dot, Labeled, Markdown, Modal, Select } from './ui'
import { TagInput } from './TagInput'

type AnyItem = Story | Task | Issue

const UPDATERS: Record<ItemKind, (id: string, patch: Record<string, unknown>) => Promise<void>> = {
  story: api.updateStory, task: api.updateTask, issue: api.updateIssue
}
const REMOVERS: Record<ItemKind, (id: string) => Promise<void>> = {
  story: api.removeStory, task: api.removeTask, issue: api.removeIssue
}

export function ItemDialog(): ReactNode {
  const { openItem, setOpenItem, snap, run } = useStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newTask, setNewTask] = useState('')

  const kind = openItem?.kind
  const item = useMemo<AnyItem | undefined>(() => {
    if (!snap || !openItem) return undefined
    const pool = openItem.kind === 'story' ? snap.stories : openItem.kind === 'task' ? snap.tasks : snap.issues
    return pool.find((i) => i.id === openItem.id) as AnyItem | undefined
  }, [snap, openItem])

  useEffect(() => {
    if (!openItem) return
    let alive = true
    api.listComments(openItem.kind, openItem.id).then((c) => { if (alive) setComments(c) })
    return () => { alive = false }
  }, [openItem, snap])

  useEffect(() => {
    setDescDraft(item?.description ?? '')
    setEditingDescription(false)
  }, [item?.id])

  if (!openItem || !snap || !item || !kind) return null

  const statuses = statusesOf(snap.statuses, kind)
  const patch = (changes: Record<string, unknown>): void => {
    void run(() => UPDATERS[kind](item.id, changes))
  }

  const story = kind === 'story' ? (item as Story) : null
  const issue = kind === 'issue' ? (item as Issue) : null
  const task = kind === 'task' ? (item as Task) : null
  const subtasks = story ? snap.tasks.filter((t) => t.storyId === story.id) : []
  const parentStory = task?.storyId ? snap.stories.find((s) => s.id === task.storyId) : null
  const taskDoneIds = new Set(statusesOf(snap.statuses, 'task').filter((s) => s.isClosed).map((s) => s.id))

  const addComment = (): void => {
    const body = commentDraft.trim()
    if (!body) return
    setCommentDraft('')
    void run(async () => {
      await api.createComment({ projectId: snap.project.id, entityKind: kind, entityId: item.id, body })
      setComments(await api.listComments(kind, item.id))
    })
  }

  return (
    <>
      <Modal
        open
        onClose={() => setOpenItem(null)}
        width="max-w-4xl"
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-faint">{refLabel(snap.project.prefix, item.ref)}</span>
            <span className="text-faint">·</span>
            <span className="text-dim">{KIND_LABEL[kind]}</span>
            {item.blocked === 1 && <Badge color="#ef4444"><Ban size={10} /> Bloqueada</Badge>}
          </span>
        }
      >
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          {/* ---------------------------------------------------- columna principal */}
          <div className="min-w-0">
            <textarea
              className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold leading-snug hover:border-line focus:border-brand"
              rows={Math.max(1, Math.ceil(item.title.length / 56))}
              defaultValue={item.title}
              key={item.id + item.title}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next && next !== item.title) patch({ title: next })
              }}
            />

            {parentStory && (
              <button
                className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-dim hover:text-brand"
                onClick={() => setOpenItem({ kind: 'story', id: parentStory.id })}
              >
                <CornerDownRight size={12} />
                <span className="font-mono text-faint">{refLabel(snap.project.prefix, parentStory.ref)}</span>
                {parentStory.title}
              </button>
            )}

            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">Descripción</h3>
              <button className="btn btn-ghost px-2 py-1 text-xs text-faint hover:text-ink"
                onClick={() => {
                  if (editingDescription && descDraft !== item.description) patch({ description: descDraft })
                  setEditingDescription(!editingDescription)
                }}>
                {editingDescription ? <><Eye size={13} /> Ver</> : <><Pencil size={13} /> Editar</>}
              </button>
            </div>

            {editingDescription ? (
              <textarea
                autoFocus
                className="field mt-1.5 min-h-40 resize-y font-mono text-[13px]"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => { if (descDraft !== item.description) patch({ description: descDraft }) }}
                placeholder="Admite Markdown: **negrita**, listas, `código`, tablas…"
              />
            ) : item.description ? (
              <div className="mt-1.5 rounded-lg border border-line bg-app/50 px-3 py-2">
                <Markdown>{item.description}</Markdown>
              </div>
            ) : (
              <button className="mt-1.5 w-full rounded-lg border border-dashed border-line px-3 py-4 text-left text-[13px] text-faint hover:bg-hover"
                onClick={() => setEditingDescription(true)}>
                Sin descripción. Haz clic para escribir una.
              </button>
            )}

            {/* ------------------------------------------------------------ subtareas */}
            {story && (
              <section className="mt-6">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  Tareas {subtasks.length > 0 && <span className="ml-1 font-mono normal-case text-dim">
                    {subtasks.filter((t) => taskDoneIds.has(t.statusId)).length}/{subtasks.length}
                  </span>}
                </h3>
                <div className="space-y-1">
                  {subtasks.map((t) => {
                    const done = taskDoneIds.has(t.statusId)
                    const taskStatuses = statusesOf(snap.statuses, 'task')
                    return (
                      <div key={t.id} className="group flex items-center gap-2 rounded-lg border border-line bg-app/40 px-2 py-1.5">
                        <button
                          className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-faint hover:border-ink')}
                          onClick={() => {
                            const target = done ? taskStatuses[0] : taskStatuses.find((s) => s.isClosed)
                            if (target) void run(() => api.updateTask(t.id, { statusId: target.id }))
                          }}
                          aria-label={done ? 'Reabrir tarea' : 'Completar tarea'}
                        >
                          {done && <Check size={11} />}
                        </button>
                        <button className={cn('flex-1 truncate text-left text-[13px]', done && 'text-faint line-through')}
                          onClick={() => setOpenItem({ kind: 'task', id: t.id })}>
                          <span className="mr-1.5 font-mono text-[11px] text-faint">{refLabel(snap.project.prefix, t.ref)}</span>
                          {t.title}
                        </button>
                        <button className="text-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                          onClick={() => void run(() => api.removeTask(t.id))} aria-label="Eliminar tarea">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <form className="mt-1.5 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const title = newTask.trim()
                    if (!title) return
                    setNewTask('')
                    void run(() => api.createTask({ projectId: snap.project.id, title, storyId: story.id }))
                  }}>
                  <Plus size={14} className="text-faint" />
                  <input className="field py-1.5 text-[13px]" placeholder="Añadir tarea y pulsar Enter"
                    value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                </form>
              </section>
            )}

            {/* ----------------------------------------------------------- comentarios */}
            <section className="mt-6">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                Notas {comments.length > 0 && <span className="ml-1 font-mono normal-case text-dim">{comments.length}</span>}
              </h3>
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="group rounded-lg border border-line bg-app/40 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-faint">
                      <span>{formatRelative(c.createdAt)}</span>
                      <button className="ml-auto opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        onClick={() => void run(async () => {
                          await api.removeComment(c.id)
                          setComments(await api.listComments(kind, item.id))
                        })} aria-label="Eliminar nota">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <Markdown>{c.body}</Markdown>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-end gap-2">
                <textarea
                  className="field min-h-[38px] resize-y py-2 text-[13px]"
                  rows={1}
                  placeholder="Escribe una nota… (Ctrl+Enter para guardar)"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment() } }}
                />
                <button className="btn btn-primary px-2.5 py-2" onClick={addComment} disabled={!commentDraft.trim()}>
                  <Send size={14} />
                </button>
              </div>
            </section>
          </div>

          {/* ----------------------------------------------------------- panel lateral */}
          <div className="space-y-3.5">
            <Labeled label="Estado">
              <Select
                value={item.statusId}
                onChange={(statusId) => patch({ statusId })}
                options={statuses.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Labeled>

            {story && (
              <Labeled label="Puntos">
                <Select
                  value={story.points == null ? '' : String(story.points)}
                  onChange={(v) => patch({ points: v === '' ? null : Number(v) })}
                  options={POINT_SCALE.map((p) => ({ value: p == null ? '' : String(p), label: pointsLabel(p) }))}
                />
              </Labeled>
            )}

            {issue && (
              <>
                <Labeled label="Tipo">
                  <Select value={issue.type} onChange={(type) => patch({ type })}
                    options={ISSUE_TYPES.map((t) => ({ value: t, label: ISSUE_TYPE_LABEL[t] }))} />
                </Labeled>
                <Labeled label="Severidad">
                  <Select value={issue.severity} onChange={(severity) => patch({ severity })}
                    options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
                </Labeled>
              </>
            )}

            <Labeled label="Prioridad">
              <Select value={item.priority} onChange={(priority) => patch({ priority })}
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
            </Labeled>

            {story && (
              <Labeled label="Épica">
                <Select
                  value={story.epicId ?? ''}
                  onChange={(epicId) => patch({ epicId: epicId || null })}
                  options={[{ value: '', label: 'Sin épica' }, ...snap.epics.map((e) => ({ value: e.id, label: e.title }))]}
                />
              </Labeled>
            )}

            {(story || issue) && (
              <Labeled label="Sprint">
                <Select
                  value={(story?.sprintId ?? issue?.sprintId) ?? ''}
                  onChange={(sprintId) => patch({ sprintId: sprintId || null })}
                  options={[{ value: '', label: 'Backlog' }, ...snap.sprints.map((s) => ({ value: s.id, label: s.name }))]}
                />
              </Labeled>
            )}

            <Labeled label="Fecha límite">
              <input type="date" className="field" value={item.dueDate?.slice(0, 10) ?? ''}
                onChange={(e) => patch({ dueDate: e.target.value || null })} />
            </Labeled>

            <Labeled label="Etiquetas">
              <TagInput value={item.tags} known={snap.tags} onChange={(tags) => patch({ tags })} />
            </Labeled>

            <div className="space-y-1.5 border-t border-line pt-3">
              <button className="btn w-full justify-center text-[13px]"
                onClick={() => patch({ blocked: item.blocked === 1 ? 0 : 1 })}>
                <Ban size={14} className={item.blocked === 1 ? 'text-red-400' : 'text-faint'} />
                {item.blocked === 1 ? 'Desbloquear' : 'Marcar bloqueada'}
              </button>
              <button className="btn w-full justify-center text-[13px]"
                onClick={() => {
                  void navigator.clipboard.writeText(`${refLabel(snap.project.prefix, item.ref)} ${item.title}`)
                  useStore.getState().toast('ok', 'Referencia copiada')
                }}>
                <Link2 size={14} className="text-faint" /> Copiar referencia
              </button>
              <button className="btn btn-danger w-full justify-center text-[13px]" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Eliminar
              </button>
            </div>

            <p className="pt-1 text-[11px] leading-relaxed text-faint">
              Creada {formatRelative(item.createdAt)}<br />
              Modificada {formatRelative(item.updatedAt)}
              {item.closedAt && <><br />Cerrada {formatRelative(item.closedAt)}</>}
            </p>
          </div>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title={`Eliminar ${KIND_LABEL[kind].toLowerCase()}`}
        message={<>Se eliminará <b>{item.title}</b>{story && subtasks.length > 0 && <> y sus {subtasks.length} tarea(s)</>}. Esta acción no se puede deshacer.</>}
        onConfirm={() => {
          setOpenItem(null)
          void run(() => REMOVERS[kind](item.id), 'Elemento eliminado')
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  )
}

export function StatusPill({ color, name }: { color: string; name: string }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-dim">
      <Dot color={color} /> {name}
    </span>
  )
}
