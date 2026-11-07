import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Check, Circle, Rocket } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Hoy as HoyData } from '../../../shared/types'
import { Page } from '../components/Page'
import { refLabel } from '../lib/ui'

/**
 * Dos pendientes de vida y la tarea en curso. Al terminar una, aparece la
 * siguiente: no hay nada que paginar ni marcar, solo lo de ahora.
 */
export function Hoy(): ReactNode {
  const { toast, refresh, currentId } = useStore()
  const [data, setData] = useState<HoyData | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { void api.hoy().then(setData) }, [])
  useEffect(load, [load])

  const terminarPendiente = async (id: string): Promise<void> => {
    setBusy(true)
    await api.togglePendiente(id)
    load()
    setBusy(false)
  }

  const terminarTarea = async (): Promise<void> => {
    const tarea = data?.tarea
    if (!tarea) return
    if (!tarea.closeStatusId) {
      toast('error', `${tarea.projectName} no tiene ninguna columna de tareas marcada como de cierre`)
      return
    }
    setBusy(true)
    await api.updateTask(tarea.id, { statusId: tarea.closeStatusId })
    load()
    // El proyecto abierto acaba de cambiar, así que el resto de la app también.
    if (currentId) await refresh()
    setBusy(false)
    toast('ok', `${refLabel(tarea.projectPrefix, tarea.ref)} hecha`)
  }

  if (!data) return null

  return (
    <Page title="Hoy" subtitle="Dos cosas de la vida y una del trabajo">
      <div className="max-w-2xl space-y-5">
        <section className="card p-4">
          <h2 className="mb-3 text-[14px] font-semibold">De la vida</h2>
          {data.pendientes.length === 0 ? (
            <p className="text-[12px] text-faint">
              Nada pendiente. Se añaden desde el atajo del móvil.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.pendientes.map((pendiente) => (
                <li key={pendiente.id}>
                  <button disabled={busy} onClick={() => void terminarPendiente(pendiente.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border border-line bg-app/40 px-3 py-2 text-left hover:bg-hover disabled:opacity-50">
                    <span className="relative shrink-0 text-faint group-hover:text-brand">
                      <Circle size={16} />
                      <Check size={10} className="absolute left-[3px] top-[3px] opacity-0 group-hover:opacity-100" />
                    </span>
                    <span className="text-[13px]">{pendiente.texto}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-[14px] font-semibold">Del trabajo</h2>
          {!data.tarea ? (
            <p className="text-[12px] text-faint">
              Ninguna tarea abierta en un sprint activo.
            </p>
          ) : (
            <div className="rounded-lg border border-line bg-app/40 p-3">
              <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-faint">
                <Rocket size={12} />
                {data.tarea.projectName} · {data.tarea.sprintName} ·{' '}
                {refLabel(data.tarea.projectPrefix, data.tarea.ref)}
              </p>
              <p className="text-[14px] font-medium">{data.tarea.title}</p>
              {data.tarea.storyTitle && (
                <p className="mt-0.5 text-[12px] text-faint">en «{data.tarea.storyTitle}»</p>
              )}
              <button className="btn btn-primary mt-3" disabled={busy} onClick={() => void terminarTarea()}>
                <Check size={14} /> Hecha
              </button>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
