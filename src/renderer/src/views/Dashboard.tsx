import type { ReactNode } from 'react'
import {
  ListTodo, Bug, Rocket, Target, CalendarClock, Activity as ActivityIcon, Layers, Plus, Ban
} from 'lucide-react'
import { useStore } from '../store/useStore'
import {
  cn, daysUntil, formatDate, formatRelative, isDone, refLabel, statusesOf, sumPoints
} from '../lib/ui'
import { Page, StatCard } from '../components/Page'
import { Burndown } from '../components/Burndown'
import { Empty, Progress, Dot } from '../components/ui'
import type { Story } from '../../../shared/types'

export function Dashboard(): ReactNode {
  const { snap, setView, setOpenItem, sprintId, setSprint } = useStore()
  if (!snap) return null

  const { project, statuses, stories, tasks, issues, epics, sprints, activity } = snap
  const openIssueIds = statusesOf(statuses, 'issue').filter((s) => !s.isClosed).map((s) => s.id)
  const doneStories = stories.filter((s) => isDone(statuses, s))
  const activeSprint = sprints.find((s) => s.id === sprintId && !s.closed) ?? [...sprints].reverse().find((s) => !s.closed)
  const sprintStories = activeSprint ? stories.filter((s) => s.sprintId === activeSprint.id) : []
  const sprintDone = sprintStories.filter((s) => isDone(statuses, s))
  const backlog = stories.filter((s) => !s.sprintId && !isDone(statuses, s))

  const upcoming = [...stories, ...tasks, ...issues]
    .filter((i) => i.dueDate && !isDone(statuses, i))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 6)

  const blocked = [...stories, ...issues].filter((i) => i.blocked === 1)
  const daysLeft = activeSprint?.endDate ? daysUntil(activeSprint.endDate) : null

  const kindOf = (id: string): 'story' | 'task' | 'issue' =>
    stories.some((s) => s.id === id) ? 'story' : tasks.some((t) => t.id === id) ? 'task' : 'issue'

  return (
    <Page
      title={project.name}
      subtitle={project.description || `Referencias ${project.prefix}-…`}
      actions={
        <button className="btn btn-primary" onClick={() => setView('backlog')}>
          <Plus size={15} /> Ir al backlog
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<ListTodo size={13} />} label="Historias"
              value={`${doneStories.length}/${stories.length}`}
              hint={`${sumPoints(doneStories)} de ${sumPoints(stories)} puntos`} />
            <StatCard icon={<Rocket size={13} />} label="Sprint activo"
              value={activeSprint ? `${sprintDone.length}/${sprintStories.length}` : '—'}
              hint={activeSprint ? (daysLeft != null ? (daysLeft >= 0 ? `quedan ${daysLeft} días` : `terminó hace ${-daysLeft} días`) : activeSprint.name) : 'sin sprint abierto'}
              color={daysLeft != null && daysLeft < 0 ? '#ef4444' : undefined} />
            <StatCard icon={<Bug size={13} />} label="Incidencias abiertas"
              value={issues.filter((i) => openIssueIds.includes(i.statusId)).length}
              hint={`${issues.length} en total`} />
            <StatCard icon={<Target size={13} />} label="En backlog"
              value={backlog.length} hint={`${sumPoints(backlog)} puntos pendientes`} />
          </div>

          {activeSprint ? (
            <section className="card p-4">
              <header className="mb-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                    <Rocket size={15} className="text-brand" />
                    {activeSprint.name}
                  </h2>
                  {activeSprint.goal && <p className="mt-0.5 truncate text-[12px] text-faint">{activeSprint.goal}</p>}
                </div>
                <div className="text-right text-[11px] text-faint">
                  {activeSprint.startDate && activeSprint.endDate && (
                    <p>{formatDate(activeSprint.startDate)} → {formatDate(activeSprint.endDate)}</p>
                  )}
                  <p className="font-mono text-dim">{sumPoints(sprintDone)}/{sumPoints(sprintStories)} pts</p>
                </div>
                <button className="btn" onClick={() => { setSprint(activeSprint.id); setView('sprint') }}>Abrir</button>
              </header>
              <div className="h-48">
                <Burndown sprintId={activeSprint.id} height={190} />
              </div>
            </section>
          ) : (
            <Empty icon={<Rocket size={24} />} title="No hay ningún sprint abierto"
              hint="Crea un sprint desde el backlog y arrastra historias dentro para planificar."
              action={<button className="btn btn-primary" onClick={() => setView('backlog')}>Planificar sprint</button>} />
          )}

          {epics.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
                <Layers size={15} className="text-violet-400" /> Épicas
              </h2>
              <div className="space-y-2.5">
                {epics.slice(0, 5).map((epic) => {
                  const mine = stories.filter((s) => s.epicId === epic.id)
                  const done = mine.filter((s) => isDone(statuses, s))
                  return (
                    <button key={epic.id} className="block w-full text-left" onClick={() => setView('epics')}>
                      <div className="mb-1 flex items-baseline gap-2 text-[12px]">
                        <Dot color={epic.color} />
                        <span className="flex-1 truncate">{epic.title}</span>
                        <span className="font-mono text-[11px] text-faint">{done.length}/{mine.length}</span>
                      </div>
                      <Progress value={done.length} total={mine.length} color={epic.color} />
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {blocked.length > 0 && (
            <section className="card border-red-900/60 p-4">
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-red-300">
                <Ban size={14} /> Bloqueadas ({blocked.length})
              </h2>
              <div className="space-y-1">
                {blocked.slice(0, 5).map((item) => (
                  <button key={item.id} className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-hover"
                    onClick={() => setOpenItem({ kind: kindOf(item.id), id: item.id })}>
                    <span className="font-mono text-[11px] text-faint">{refLabel(project.prefix, item.ref)}</span>
                    <span className="flex-1 truncate text-[12px]">{item.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              <CalendarClock size={14} className="text-amber-400" /> Próximos vencimientos
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-[12px] text-faint">Nada con fecha límite pendiente.</p>
            ) : (
              <div className="space-y-1">
                {upcoming.map((item) => {
                  const d = daysUntil(item.dueDate)
                  return (
                    <button key={item.id} className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-hover"
                      onClick={() => setOpenItem({ kind: kindOf(item.id), id: item.id })}>
                      <span className="font-mono text-[11px] text-faint">{refLabel(project.prefix, item.ref)}</span>
                      <span className="flex-1 truncate text-[12px]">{item.title}</span>
                      <span className={cn('shrink-0 font-mono text-[11px]',
                        d != null && d < 0 ? 'text-red-400' : d != null && d <= 2 ? 'text-amber-400' : 'text-faint')}>
                        {d != null && d < 0 ? `${-d}d tarde` : d === 0 ? 'hoy' : `${d}d`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              <ActivityIcon size={14} className="text-sky-400" /> Actividad reciente
            </h2>
            {activity.length === 0 ? (
              <p className="text-[12px] text-faint">Aún no hay movimientos.</p>
            ) : (
              <ol className="space-y-2">
                {activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex gap-2 text-[12px]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {a.entityRef != null && (
                          <span className="mr-1 font-mono text-[11px] text-faint">{refLabel(project.prefix, a.entityRef)}</span>
                        )}
                        {a.entityTitle}
                      </p>
                      <p className="text-[11px] text-faint">{a.detail} · {formatRelative(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </Page>
  )
}

export type { Story }
