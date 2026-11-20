import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Circle, Flame, Pause, Play, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { DiaRutina, RutinaHoy } from '../../../shared/types'
import { Page } from '../components/Page'
import { cn } from '../lib/ui'

/** Lo que enseña la gráfica de arriba. Un mes entra de un vistazo. */
const DIAS = 30

const etiquetaDia = (dia: string): string =>
  new Date(`${dia}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

const tituloDia = (dia: string): string =>
  new Date(`${dia}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * El mes entero, un palo por día: lleno si cumpliste todo, a medias si
 * cumpliste parte, vacío si no cumpliste nada.
 *
 * Los días anteriores al alta de cualquier hábito salen en gris: ahí no
 * fallaste, es que todavía no existía nada que cumplir.
 */
function Mes({ historial }: { historial: DiaRutina[] }): ReactNode {
  return (
    <div className="flex h-28 items-stretch gap-1">
      {historial.map((d) => {
        const parte = d.total > 0 ? d.hechas / d.total : 0
        return (
          <div key={d.dia} className="flex h-full flex-1 flex-col items-center gap-1"
            title={`${tituloDia(d.dia)}: ${d.hechas} de ${d.total}`}>
            <div className="flex w-full min-h-0 flex-1 flex-col justify-end rounded-sm bg-line/40">
              {d.total > 0 && (
                <div className={cn('w-full rounded-sm', parte === 1 ? 'bg-brand' : 'bg-brand/50')}
                  style={{ height: `${Math.max(parte * 100, parte > 0 ? 6 : 0)}%` }} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * La rutina: los hábitos de todos los días.
 *
 * Sólo se marca el día de hoy. Lo de ayer ya está cerrado y no se puede
 * arreglar a posteriori, que es lo que hace que el porcentaje sea honesto.
 */
export function Rutina(): ReactNode {
  const { toast } = useStore()
  const [lista, setLista] = useState<RutinaHoy[] | null>(null)
  const [historial, setHistorial] = useState<DiaRutina[]>([])
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    void api.listRutinas().then(setLista)
    void api.historialRutina(DIAS).then(setHistorial)
  }, [])
  useEffect(load, [load])

  const añadir = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const limpio = texto.trim()
    if (!limpio) return
    setBusy(true)
    setTexto('')
    await api.createRutina(limpio)
    load()
    setBusy(false)
  }

  const marcar = async (rutina: RutinaHoy): Promise<void> => {
    setBusy(true)
    await api.toggleRutina(rutina.id)
    load()
    setBusy(false)
  }

  const pausar = async (rutina: RutinaHoy): Promise<void> => {
    setBusy(true)
    await api.updateRutina(rutina.id, { activa: rutina.activa ? 0 : 1 })
    load()
    setBusy(false)
    toast('info', rutina.activa ? `«${rutina.texto}» en pausa` : `«${rutina.texto}» otra vez activo`)
  }

  const borrar = async (rutina: RutinaHoy): Promise<void> => {
    setBusy(true)
    await api.removeRutina(rutina.id)
    load()
    setBusy(false)
    toast('info', `Borrado «${rutina.texto}» y su historial`)
  }

  if (!lista) return null

  const hechasHoy = lista.filter((r) => r.hecha).length
  const hoy = historial.at(-1)

  return (
    <Page title="Rutina" subtitle="Lo de todos los días. Sólo se marca hoy; lo de ayer ya está cerrado.">
      <div className={cn('grid items-start gap-5', lista.length > 0 ? 'max-w-6xl lg:grid-cols-2' : 'max-w-2xl')}>
        <div className="space-y-5">
          <form onSubmit={(e) => void añadir(e)} className="flex gap-2">
            <input className="field flex-1" placeholder="Añadir un hábito…" value={texto}
              onChange={(e) => setTexto(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={busy || !texto.trim()}>Añadir</button>
          </form>

          <section className="card p-4">
            <h2 className="mb-3 flex items-baseline gap-2 text-[14px] font-semibold">
              Hoy
              <span className="text-[12px] font-normal text-faint">
                {hechasHoy} de {lista.length}
              </span>
            </h2>

            {lista.length === 0 ? (
              <p className="text-[12px] text-faint">
                Nada en la rutina todavía. Añade algo de lo que haces cada día.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lista.map((rutina) => (
                  <li key={rutina.id}
                    className="group flex items-center gap-2.5 rounded-lg border border-line bg-app/40 px-3 py-2">
                    <button disabled={busy} onClick={() => void marcar(rutina)}
                      className={cn('relative shrink-0', rutina.hecha ? 'text-brand' : 'text-faint hover:text-brand')}
                      title={rutina.hecha ? 'Quitar la marca de hoy' : 'Marcar hecho hoy'}>
                      <Circle size={16} />
                      <Check size={10} className={cn('absolute left-[3px] top-[3px]',
                        rutina.hecha ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
                    </button>

                    <span className={cn('flex-1 text-[13px]', rutina.hecha && 'text-faint line-through')}>
                      {rutina.texto}
                    </span>

                    {rutina.racha > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-amber-300/80"
                        title={`${rutina.racha} días seguidos`}>
                        <Flame size={12} />{rutina.racha}
                      </span>
                    )}

                    <span className="font-mono text-[11px] text-faint"
                      title={`${rutina.cumplidos} de los últimos ${rutina.ventana} días`}>
                      {Math.round((rutina.cumplidos / rutina.ventana) * 100)}%
                    </span>

                    <button disabled={busy} onClick={() => void pausar(rutina)}
                      className="shrink-0 text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                      title={rutina.activa ? 'Pausar' : 'Reanudar'}>
                      {rutina.activa ? <Pause size={13} /> : <Play size={13} />}
                    </button>

                    <button disabled={busy} onClick={() => void borrar(rutina)}
                      className="shrink-0 text-faint opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                      title="Borrar">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {lista.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-1 flex items-baseline gap-2 text-[14px] font-semibold">
              Últimos {DIAS} días
              {hoy && (
                <span className="text-[12px] font-normal text-faint">
                  hoy {hoy.hechas} de {hoy.total}
                </span>
              )}
            </h2>

            <Mes historial={historial} />

            <div className="mt-1 flex justify-between text-[10px] text-faint">
              <span>{historial[0] && etiquetaDia(historial[0].dia)}</span>
              <span>hoy</span>
            </div>

            <div className="mt-4 space-y-2">
              {lista.map((rutina) => {
                const pct = Math.round((rutina.cumplidos / rutina.ventana) * 100)
                return (
                  <div key={rutina.id}>
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <span className="flex-1 truncate">{rutina.texto}</span>
                      <span className="font-mono text-[11px] text-faint">
                        {rutina.cumplidos}/{rutina.ventana}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/50">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </Page>
  )
}
