import { useEffect, useState, type ReactNode } from 'react'
import {
  Plus, Trash2, GripVertical, Check, Download, Upload, FolderOpen, Archive, Pencil
} from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { ItemKind, Status } from '../../../shared/types'
import { KIND_LABEL, TAG_PALETTE, cn } from '../lib/ui'
import { Page } from '../components/Page'
import { Confirm, Dropdown, Labeled, MenuItem, Select } from '../components/ui'
import { ProjectDialog } from '../components/ProjectDialog'

const KINDS: ItemKind[] = ['story', 'task', 'issue']

function StatusRow({ status, siblings }: { status: Status; siblings: Status[] }): ReactNode {
  const { run } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fallback, setFallback] = useState(siblings.find((s) => s.id !== status.id)?.id ?? '')

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-line bg-app/40 px-2 py-1.5">
      <GripVertical size={14} className="text-faint opacity-30" />
      <Dropdown width={170} trigger={({ toggle }) => (
        <button onClick={toggle} className="h-4 w-4 shrink-0 rounded" style={{ background: status.color }} aria-label="Color" />
      )}>
        {(close) => (
          <div className="flex flex-wrap gap-1.5 p-1.5">
            {[...TAG_PALETTE, '#94a3b8', '#22c55e', '#6366f1'].map((c) => (
              <button key={c} className={cn('h-6 w-6 rounded border-2', status.color === c ? 'border-ink' : 'border-transparent')}
                style={{ background: c }}
                onClick={() => { void run(() => api.updateStatus(status.id, { color: c })); close() }} />
            ))}
          </div>
        )}
      </Dropdown>

      <input className="min-w-16 flex-1 bg-transparent text-[13px] outline-none" defaultValue={status.name}
        onBlur={(e) => {
          const name = e.target.value.trim()
          if (name && name !== status.name) void run(() => api.updateStatus(status.id, { name }))
          else e.target.value = status.name
        }} />

      <button
        title={status.isClosed === 1 ? 'Cuenta como terminado' : 'Marcar como columna de cierre'}
        className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          status.isClosed === 1 ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-faint')}
        onClick={() => void run(() => api.updateStatus(status.id, { isClosed: status.isClosed === 1 ? 0 : 1 }))}>
        {status.isClosed === 1 && <Check size={11} />}
      </button>

      <input type="number" min={0} title="Límite WIP (vacío o 0 = sin límite)"
        className="w-10 shrink-0 rounded border border-line bg-app px-1 py-0.5 text-center text-[12px] text-dim"
        placeholder="∞"
        defaultValue={status.wipLimit || ''}
        onBlur={(e) => {
          const value = Math.max(0, Number(e.target.value) || 0)
          if (value !== status.wipLimit) void run(() => api.updateStatus(status.id, { wipLimit: value }))
        }} />

      <button className="text-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
        disabled={siblings.length <= 1}
        onClick={() => setConfirmDelete(true)} aria-label="Eliminar estado">
        <Trash2 size={14} />
      </button>

      <Confirm open={confirmDelete} title={`Eliminar «${status.name}»`}
        confirmLabel="Eliminar columna"
        message={
          <>
            <p className="mb-3">Los elementos que estén en esta columna pasarán a:</p>
            <Select value={fallback} onChange={setFallback}
              options={siblings.filter((s) => s.id !== status.id).map((s) => ({ value: s.id, label: s.name }))} />
          </>
        }
        onConfirm={() => { if (fallback) void run(() => api.removeStatus(status.id, fallback), 'Columna eliminada') }}
        onClose={() => setConfirmDelete(false)} />
    </div>
  )
}

function StatusEditor({ kind }: { kind: ItemKind }): ReactNode {
  const { snap, run } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (!snap) return null
  const list = snap.statuses.filter((s) => s.kind === kind).sort((a, b) => a.position - b.position)

  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold">{KIND_LABEL[kind]}s</h3>
      <div className="space-y-1">
        {list.map((s) => <StatusRow key={s.id} status={s} siblings={list} />)}
      </div>
      {adding ? (
        <form className="mt-1.5" onSubmit={(e) => {
          e.preventDefault()
          const clean = name.trim()
          if (!clean) { setAdding(false); return }
          setName('')
          setAdding(false)
          void run(() => api.createStatus({ projectId: snap.project.id, kind, name: clean }))
        }}>
          <input autoFocus className="field py-1.5 text-[13px]" placeholder="Nombre de la columna"
            value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (!name.trim()) setAdding(false) }} />
        </form>
      ) : (
        <button className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-faint hover:text-ink" onClick={() => setAdding(true)}>
          <Plus size={12} /> añadir columna
        </button>
      )}
    </div>
  )
}

export function Settings(): ReactNode {
  const { snap, run, selectProject, loadProjects, toast } = useStore()
  const [editProject, setEditProject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [info, setInfo] = useState<{ version: string; dataPath: string } | null>(null)

  useEffect(() => {
    void window.orbit.info().then(setInfo)
  }, [])

  if (!snap) return null
  const { project, tags, stories, tasks, issues, wiki } = snap

  return (
    <Page title="Ajustes del proyecto" subtitle={project.name}>
      <div className="max-w-4xl space-y-5">
        <section className="card p-4">
          <header className="mb-3 flex items-center gap-3">
            <span className="h-4 w-4 rounded" style={{ background: project.color }} />
            <div className="flex-1">
              <h2 className="text-[14px] font-semibold">{project.name}</h2>
              <p className="font-mono text-[11px] text-faint">{project.prefix} · {stories.length + tasks.length + issues.length} elementos · {wiki.length} página(s) de wiki</p>
            </div>
            <button className="btn" onClick={() => setEditProject(true)}><Pencil size={14} /> Editar</button>
          </header>
          {project.description && <p className="text-[12px] leading-relaxed text-dim">{project.description}</p>}
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-[14px] font-semibold">Columnas de los tableros</h2>
          <p className="mb-4 text-[12px] text-faint">
            Define el flujo de cada tipo. La casilla marca las columnas que cuentan como terminado y el número de al lado es el límite WIP (vacío = sin límite).
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {KINDS.map((k) => <StatusEditor key={k} kind={k} />)}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-[14px] font-semibold">Etiquetas</h2>
          <p className="mb-3 text-[12px] text-faint">Se crean solas al escribirlas en un elemento. Haz clic para cambiar el color.</p>
          {tags.length === 0 ? (
            <p className="text-[12px] text-faint">Todavía no hay etiquetas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <div key={t.name} className="group flex items-center gap-1.5 rounded-lg border border-line bg-app/50 px-2 py-1">
                  <Dropdown width={170} trigger={({ toggle }) => (
                    <button onClick={toggle} className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                  )}>
                    {(close) => (
                      <div className="flex flex-wrap gap-1.5 p-1.5">
                        {TAG_PALETTE.map((c) => (
                          <button key={c} className={cn('h-6 w-6 rounded border-2', t.color === c ? 'border-ink' : 'border-transparent')}
                            style={{ background: c }}
                            onClick={() => { void run(() => api.upsertTag(project.id, t.name, c)); close() }} />
                        ))}
                      </div>
                    )}
                  </Dropdown>
                  <span className="text-[12px]">{t.name}</span>
                  <button className="text-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={() => void run(() => api.removeTag(project.id, t.name))} aria-label={`Eliminar ${t.name}`}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-1 text-[14px] font-semibold">Datos</h2>
          <p className="mb-3 text-[12px] text-faint">
            Todo se guarda en una base SQLite local. No sale nada de este ordenador.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void window.orbit.exportData()}>
              <Download size={14} className="text-faint" /> Exportar todo a JSON
            </button>
            <button className="btn" onClick={() => void window.orbit.importData()}>
              <Upload size={14} className="text-faint" /> Importar desde JSON
            </button>
            <button className="btn" onClick={() => {
              if (info) {
                void navigator.clipboard.writeText(info.dataPath)
                toast('ok', 'Ruta copiada al portapapeles')
              }
            }}>
              <FolderOpen size={14} className="text-faint" /> Copiar ruta de datos
            </button>
          </div>
          {info && <p className="mt-2 font-mono text-[11px] text-faint">{info.dataPath}/orbit.db</p>}
        </section>

        <section className="card border-red-900/50 p-4">
          <h2 className="mb-1 text-[14px] font-semibold text-red-300">Zona peligrosa</h2>
          <p className="mb-3 text-[12px] text-faint">Archivar lo oculta de la lista; eliminar lo borra para siempre.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void run(async () => {
              await api.updateProject(project.id, { archived: project.archived ? 0 : 1 })
              await loadProjects()
            }, project.archived ? 'Proyecto restaurado' : 'Proyecto archivado')}>
              <Archive size={14} className="text-faint" /> {project.archived ? 'Restaurar' : 'Archivar proyecto'}
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Eliminar proyecto
            </button>
          </div>
        </section>
      </div>

      <ProjectDialog open={editProject} project={project} onClose={() => setEditProject(false)} />
      <Confirm open={confirmDelete} title="Eliminar proyecto"
        message={<>Se borrará <b>{project.name}</b> con sus {stories.length} historias, {tasks.length} tareas, {issues.length} incidencias y la wiki. No se puede deshacer.</>}
        onConfirm={() => void run(async () => {
          await api.removeProject(project.id)
          await selectProject(null)
        }, 'Proyecto eliminado')}
        onClose={() => setConfirmDelete(false)} />
    </Page>
  )
}

export { Labeled }
