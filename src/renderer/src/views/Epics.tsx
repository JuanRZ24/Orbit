import { useState, type ReactNode } from 'react'
import { Plus, Layers, Trash2, MoreHorizontal, CheckCircle2, RotateCcw, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { PROJECT_COLORS } from '../../../shared/types'
import { cn, isDone, refLabel, sumPoints } from '../lib/ui'
import { Page } from '../components/Page'
import { Confirm, Dropdown, Empty, Labeled, MenuItem, Modal, Progress } from '../components/ui'

export function Epics(): ReactNode {
  const { snap, run, setOpenItem } = useStore()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[1])
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!snap) return null
  const { epics, stories, statuses, project } = snap
  const orphan = stories.filter((s) => !s.epicId)

  const create = (): void => {
    const clean = title.trim()
    if (!clean) return
    setCreating(false)
    setTitle('')
    setDescription('')
    void run(() => api.createEpic({ projectId: project.id, title: clean, description, color }), 'Épica creada')
  }

  return (
    <Page
      title="Épicas"
      subtitle={`${epics.length} épica(s) · ${orphan.length} historia(s) sin asignar`}
      actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Nueva épica</button>}
    >
      {epics.length === 0 ? (
        <Empty icon={<Layers size={26} />} title="Sin épicas"
          hint="Las épicas agrupan historias que persiguen un mismo objetivo grande."
          action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Crear la primera</button>} />
      ) : (
        <div className="space-y-3">
          {epics.map((epic) => {
            const mine = stories.filter((s) => s.epicId === epic.id)
            const done = mine.filter((s) => isDone(statuses, s))
            const isOpen = expanded[epic.id]
            return (
              <section key={epic.id} className={cn('card overflow-hidden', epic.closed === 1 && 'opacity-60')}>
                <header className="flex items-start gap-3 p-4">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded" style={{ background: epic.color }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                      {epic.title}
                      {epic.closed === 1 && <span className="rounded bg-app px-1.5 py-0.5 text-[11px] text-faint">cerrada</span>}
                    </h3>
                    {epic.description && <p className="mt-1 text-[12px] leading-relaxed text-faint">{epic.description}</p>}
                    <div className="mt-2.5 flex items-center gap-3">
                      <Progress value={done.length} total={mine.length} color={epic.color} className="max-w-sm" />
                      <span className="shrink-0 font-mono text-[11px] text-faint">
                        {done.length}/{mine.length} · {sumPoints(done)}/{sumPoints(mine)} pts
                      </span>
                    </div>
                  </div>
                  <Dropdown align="right" width={200} trigger={({ toggle }) => (
                    <button onClick={toggle} className="rounded p-1 text-faint hover:bg-hover hover:text-ink">
                      <MoreHorizontal size={15} />
                    </button>
                  )}>
                    {(close) => (
                      <>
                        <MenuItem icon={epic.closed === 1 ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                          onClick={() => { void run(() => api.updateEpic(epic.id, { closed: epic.closed === 1 ? 0 : 1 })); close() }}>
                          {epic.closed === 1 ? 'Reabrir' : 'Marcar cerrada'}
                        </MenuItem>
                        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase text-faint">Color</p>
                        <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
                          {PROJECT_COLORS.map((c) => (
                            <button key={c} className={cn('h-5 w-5 rounded border-2', epic.color === c ? 'border-ink' : 'border-transparent')}
                              style={{ background: c }}
                              onClick={() => { void run(() => api.updateEpic(epic.id, { color: c })); close() }} />
                          ))}
                        </div>
                        <div className="my-1 h-px bg-line" />
                        <MenuItem danger icon={<Trash2 size={14} />} onClick={() => { setToDelete(epic.id); close() }}>
                          Eliminar épica
                        </MenuItem>
                      </>
                    )}
                  </Dropdown>
                </header>

                {mine.length > 0 && (
                  <>
                    <button className="flex w-full items-center gap-1.5 border-t border-line px-4 py-2 text-left text-[12px] text-faint hover:bg-hover"
                      onClick={() => setExpanded((e) => ({ ...e, [epic.id]: !e[epic.id] }))}>
                      <ChevronRight size={13} className={cn('transition-transform', isOpen && 'rotate-90')} />
                      {isOpen ? 'Ocultar' : 'Ver'} historias
                    </button>
                    {isOpen && (
                      <div className="space-y-1 border-t border-line p-2">
                        {mine.map((s) => (
                          <button key={s.id}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
                            onClick={() => setOpenItem({ kind: 'story', id: s.id })}>
                            <span className="font-mono text-[11px] text-faint">{refLabel(project.prefix, s.ref)}</span>
                            <span className={cn('flex-1 truncate text-[13px]', isDone(statuses, s) && 'text-faint line-through')}>
                              {s.title}
                            </span>
                            <span className="font-mono text-[11px] text-faint">{s.points ?? '?'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva épica" width="max-w-lg"
        footer={
          <>
            <button className="btn" onClick={() => setCreating(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={create} disabled={!title.trim()}>Crear</button>
          </>
        }>
        <div className="space-y-4">
          <Labeled label="Título">
            <input autoFocus className="field" value={title} placeholder="Autenticación, Pagos, Onboarding…"
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create() }} />
          </Labeled>
          <Labeled label="Descripción">
            <textarea className="field min-h-20 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Labeled>
          <Labeled label="Color">
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('h-7 w-7 rounded-lg border-2', color === c ? 'scale-110 border-ink' : 'border-transparent')}
                  style={{ background: c }} />
              ))}
            </div>
          </Labeled>
        </div>
      </Modal>

      <Confirm open={!!toDelete} title="Eliminar épica"
        message="Las historias que pertenecen a esta épica se quedarán sin épica, pero no se borran."
        onConfirm={() => { if (toDelete) void run(() => api.removeEpic(toDelete), 'Épica eliminada') }}
        onClose={() => setToDelete(null)} />
    </Page>
  )
}
