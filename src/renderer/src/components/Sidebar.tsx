import type { ReactNode } from 'react'
import {
  LayoutDashboard, ListTodo, Rocket, Columns3, Bug, Layers, BookText, Settings,
  Plus, ChevronsUpDown, Search, Keyboard, FolderOpen, PanelLeftClose
} from 'lucide-react'
import { useStore, type ViewName } from '../store/useStore'
import { cn, statusesOf } from '../lib/ui'
import { Dot, Dropdown, MenuItem, Progress } from './ui'

const NAV: Array<{ view: ViewName; label: string; icon: ReactNode; key: string }> = [
  { view: 'dashboard', label: 'Resumen', icon: <LayoutDashboard size={16} />, key: '1' },
  { view: 'backlog', label: 'Backlog', icon: <ListTodo size={16} />, key: '2' },
  { view: 'sprint', label: 'Sprint', icon: <Rocket size={16} />, key: '3' },
  { view: 'kanban', label: 'Tablero', icon: <Columns3 size={16} />, key: '4' },
  { view: 'issues', label: 'Incidencias', icon: <Bug size={16} />, key: '5' },
  { view: 'epics', label: 'Épicas', icon: <Layers size={16} />, key: '6' },
  { view: 'wiki', label: 'Wiki', icon: <BookText size={16} />, key: '7' }
]

export function Sidebar({ onNewProject }: { onNewProject: () => void }): ReactNode {
  const { projects, currentId, snap, view, setView, selectProject, setPalette, setShortcuts, toggleSidebar } = useStore()
  const current = projects.find((p) => p.project.id === currentId)

  const counts = (() => {
    if (!snap) return { backlog: 0, sprint: 0, issues: 0, epics: 0, wiki: 0 }
    const openStory = statusesOf(snap.statuses, 'story').filter((s) => !s.isClosed).map((s) => s.id)
    const openIssue = statusesOf(snap.statuses, 'issue').filter((s) => !s.isClosed).map((s) => s.id)
    const activeSprint = [...snap.sprints].reverse().find((s) => !s.closed)
    return {
      backlog: snap.stories.filter((s) => !s.sprintId && openStory.includes(s.statusId)).length,
      sprint: activeSprint ? snap.stories.filter((s) => s.sprintId === activeSprint.id).length : 0,
      issues: snap.issues.filter((i) => openIssue.includes(i.statusId)).length,
      epics: snap.epics.filter((e) => !e.closed).length,
      wiki: snap.wiki.length
    }
  })()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-[13px] font-bold text-white">O</div>
        <span className="flex-1 text-[13px] font-semibold tracking-tight">Orbit</span>
        <button className="btn btn-ghost px-1.5 py-1 text-faint hover:text-ink" onClick={toggleSidebar} title="Ocultar panel">
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="px-2 pb-2">
        <Dropdown
          width={236}
          trigger={({ toggle }) => (
            <button onClick={toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-raise px-2.5 py-2 text-left hover:bg-hover">
              {current ? <Dot color={current.project.color} /> : <FolderOpen size={14} className="text-faint" />}
              <span className="flex-1 truncate text-[13px] font-medium">
                {current?.project.name ?? 'Todos los proyectos'}
              </span>
              <ChevronsUpDown size={13} className="text-faint" />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<FolderOpen size={14} className="text-faint" />}
                onClick={() => { selectProject(null); close() }} active={!currentId}>
                Todos los proyectos
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              {projects.filter((p) => !p.project.archived).map((p) => (
                <MenuItem key={p.project.id} icon={<Dot color={p.project.color} />}
                  active={p.project.id === currentId}
                  onClick={() => { selectProject(p.project.id); close() }}>
                  {p.project.name}
                </MenuItem>
              ))}
              <div className="my-1 h-px bg-line" />
              <MenuItem icon={<Plus size={14} className="text-faint" />} onClick={() => { onNewProject(); close() }}>
                Nuevo proyecto
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>

      <button
        className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-1.5 text-left text-[13px] text-faint hover:bg-hover hover:text-dim"
        onClick={() => setPalette(true)}
      >
        <Search size={14} />
        <span className="flex-1">Buscar…</span>
        <kbd className="rounded border border-line px-1 font-mono text-[10px]">Ctrl K</kbd>
      </button>

      <nav className="flex-1 overflow-y-auto px-2">
        {currentId ? (
          <>
            {NAV.map((item) => {
              const badge = counts[item.view as keyof typeof counts]
              return (
                <button key={item.view} onClick={() => setView(item.view)}
                  className={cn(
                    'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    view === item.view ? 'bg-brand/15 text-ink' : 'text-dim hover:bg-hover hover:text-ink'
                  )}>
                  <span className={view === item.view ? 'text-brand' : 'text-faint'}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge ? <span className="font-mono text-[11px] text-faint">{badge}</span> : null}
                </button>
              )
            })}
            {current && (
              <div className="mt-4 rounded-lg border border-line bg-app/60 px-2.5 py-2">
                <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                  <span className="text-faint">Progreso</span>
                  <span className="font-mono text-dim">
                    {current.pointsClosed}/{current.points} pts
                  </span>
                </div>
                <Progress value={current.pointsClosed} total={current.points} color={current.project.color} />
              </div>
            )}
          </>
        ) : (
          <p className="px-2.5 py-2 text-[12px] leading-relaxed text-faint">
            Elige un proyecto arriba o crea uno nuevo para empezar.
          </p>
        )}
      </nav>

      <div className="border-t border-line p-2">
        {currentId && (
          <button onClick={() => setView('settings')}
            className={cn('mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
              view === 'settings' ? 'bg-brand/15 text-ink' : 'text-dim hover:bg-hover hover:text-ink')}>
            <Settings size={16} className={view === 'settings' ? 'text-brand' : 'text-faint'} />
            <span className="flex-1 text-left">Ajustes del proyecto</span>
          </button>
        )}
        <button onClick={() => setShortcuts(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-dim transition-colors hover:bg-hover hover:text-ink">
          <Keyboard size={16} className="text-faint" />
          <span className="flex-1 text-left">Atajos</span>
        </button>
      </div>
    </aside>
  )
}
