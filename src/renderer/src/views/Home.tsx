import { useState, type ReactNode } from 'react'
import { Plus, Archive, ArchiveRestore, Trash2, Sparkles, MoreHorizontal, Bug, ListTodo } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { cn, formatRelative } from '../lib/ui'
import { Confirm, Dropdown, Empty, MenuItem, Progress } from '../components/ui'
import { Page } from '../components/Page'
import { ProjectDialog } from '../components/ProjectDialog'
import type { Project } from '../../../shared/types'

export function Home(): ReactNode {
  const { projects, selectProject, run, setView } = useStore()
  const [dialog, setDialog] = useState<{ open: boolean; project?: Project | null }>({ open: false })
  const [toDelete, setToDelete] = useState<Project | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const visible = projects.filter((p) => (showArchived ? p.project.archived : !p.project.archived))

  return (
    <Page
      title="Proyectos"
      subtitle={`${projects.filter((p) => !p.project.archived).length} activo(s)`}
      actions={
        <>
          <button className="btn" onClick={() => setShowArchived((v) => !v)}>
            <Archive size={15} className="text-faint" />
            {showArchived ? 'Ver activos' : 'Ver archivados'}
          </button>
          <button className="btn btn-primary" onClick={() => setDialog({ open: true })}>
            <Plus size={15} /> Nuevo proyecto
          </button>
        </>
      }
    >
      {visible.length === 0 ? (
        <Empty
          icon={<Sparkles size={28} />}
          title={showArchived ? 'No hay proyectos archivados' : 'Todavía no hay proyectos'}
          hint={showArchived ? undefined : 'Crea tu primer proyecto o carga uno de ejemplo para ver cómo funciona el backlog, el tablero y los sprints.'}
          action={!showArchived && (
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => setDialog({ open: true })}>
                <Plus size={15} /> Crear proyecto
              </button>
              <button className="btn" onClick={() => void run(async () => {
                const demo = await api.seedDemo()
                await selectProject(demo.id)
                setView('backlog')
              }, 'Proyecto de ejemplo creado')}>
                <Sparkles size={15} className="text-faint" /> Cargar ejemplo
              </button>
            </div>
          )}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ project, storyCount, storyClosed, points, pointsClosed, issueOpen, taskOpen, activeSprint }) => (
            <div key={project.id}
              className="card group relative cursor-pointer p-4 transition-colors hover:border-faint/50"
              onClick={() => { void selectProject(project.id); setView('dashboard') }}>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-semibold">{project.name}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-faint">{project.prefix}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Dropdown align="right" width={200}
                    trigger={({ toggle }) => (
                      <button className="rounded p-1 text-faint opacity-0 hover:bg-hover hover:text-ink group-hover:opacity-100"
                        onClick={toggle} aria-label="Opciones">
                        <MoreHorizontal size={15} />
                      </button>
                    )}>
                    {(close) => (
                      <>
                        <MenuItem onClick={() => { setDialog({ open: true, project }); close() }}>Editar</MenuItem>
                        <MenuItem icon={project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          onClick={() => {
                            void run(() => api.updateProject(project.id, { archived: project.archived ? 0 : 1 }),
                              project.archived ? 'Proyecto restaurado' : 'Proyecto archivado')
                            close()
                          }}>
                          {project.archived ? 'Restaurar' : 'Archivar'}
                        </MenuItem>
                        <div className="my-1 h-px bg-line" />
                        <MenuItem danger icon={<Trash2 size={14} />} onClick={() => { setToDelete(project); close() }}>
                          Eliminar
                        </MenuItem>
                      </>
                    )}
                  </Dropdown>
                </div>
              </div>

              {project.description && (
                <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-faint">{project.description}</p>
              )}

              <div className="mt-3">
                <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                  <span className="text-faint">{storyClosed}/{storyCount} historias</span>
                  <span className="font-mono text-dim">{pointsClosed}/{points} pts</span>
                </div>
                <Progress value={pointsClosed} total={points} color={project.color} />
              </div>

              <div className="mt-3 flex items-center gap-3 text-[11px] text-faint">
                {activeSprint && (
                  <span className="truncate rounded-md bg-app px-1.5 py-0.5" title="Sprint activo">{activeSprint.name}</span>
                )}
                {taskOpen > 0 && <span className="inline-flex items-center gap-1"><ListTodo size={12} />{taskOpen}</span>}
                {issueOpen > 0 && <span className="inline-flex items-center gap-1"><Bug size={12} />{issueOpen}</span>}
                <span className={cn('ml-auto', project.archived && 'text-amber-400')}>
                  {project.archived ? 'Archivado' : formatRelative(project.updatedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectDialog open={dialog.open} project={dialog.project} onClose={() => setDialog({ open: false })} />
      <Confirm
        open={!!toDelete}
        title="Eliminar proyecto"
        message={<>Se borrará <b>{toDelete?.name}</b> con todo su backlog, tablero, incidencias y wiki. No se puede deshacer.</>}
        onConfirm={() => { if (toDelete) void run(() => api.removeProject(toDelete.id), 'Proyecto eliminado') }}
        onClose={() => setToDelete(null)}
      />
    </Page>
  )
}
