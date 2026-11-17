import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Circle, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Pendiente } from '../../../shared/types'
import { Page } from '../components/Page'
import { cn } from '../lib/ui'

/** Cuántos días enseña la gráfica. Dos semanas caben sin apretujarse. */
const DIAS = 14

/**
 * El día *local* de un sello guardado en UTC.
 *
 * No sobra: `doneAt` se guarda en UTC, y lo que marcas hecho por la noche cae
 * al día siguiente en UTC. Agrupando por la cadena cruda, un pendiente de las
 * once de la noche del lunes aparecería en el martes.
 */
function diaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** Los pendientes hechos, repartidos por el día en que se marcaron. */
function porDia(hechos: Pendiente[]): Map<string, Pendiente[]> {
  const mapa = new Map<string, Pendiente[]>()
  for (const pendiente of hechos) {
    if (!pendiente.doneAt) continue
    const dia = diaLocal(new Date(pendiente.doneAt))
    const ya = mapa.get(dia)
    if (ya) ya.push(pendiente)
    else mapa.set(dia, [pendiente])
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)))
  }
  return mapa
}

/** Los últimos `n` días hasta hoy, incluidos los que no tienen nada. */
function ultimosDias(n: number): string[] {
  const dias: string[] = []
  for (let atras = n - 1; atras >= 0; atras--) {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - atras)
    dias.push(diaLocal(fecha))
  }
  return dias
}

const HOY = diaLocal(new Date())

/** «lun 16». El día suelto no basta cuando miras dos semanas atrás. */
function etiquetaDia(dia: string): string {
  const fecha = new Date(`${dia}T00:00:00`)
  return fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })
}

function tituloDia(dia: string): string {
  if (dia === HOY) return 'Hoy'
  const fecha = new Date(`${dia}T00:00:00`)
  return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

const hora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/**
 * La gráfica de las últimas dos semanas: una barra por día, alta en proporción
 * al día más cargado. Con pocos datos una escala fija dejaría todo raso, así
 * que el máximo manda.
 */
function Grafica({ dias, cuenta }: { dias: string[]; cuenta: Map<string, Pendiente[]> }): ReactNode {
  const maximo = Math.max(1, ...dias.map((d) => cuenta.get(d)?.length ?? 0))

  return (
    // `items-stretch` no es adorno: con `items-end` las columnas se encogen a
    // su contenido, la barra se queda sin altura que repartir y salen rayitas.
    <div className="flex h-32 items-stretch gap-1.5">
      {dias.map((dia) => {
        const n = cuenta.get(dia)?.length ?? 0
        return (
          <div key={dia} className="flex h-full flex-1 flex-col items-center gap-1">
            <span className={cn('text-[10px] font-mono', n ? 'text-faint' : 'text-transparent')}>{n}</span>
            <div className="flex w-full min-h-0 flex-1 items-end">
              <div
                className={cn('w-full rounded-sm transition-all',
                  n === 0 && 'bg-line/50', dia === HOY ? 'bg-brand' : 'bg-brand/50')}
                style={{ height: n === 0 ? 2 : `${Math.max(8, (n / maximo) * 100)}%` }}
                title={`${tituloDia(dia)}: ${n}`}
              />
            </div>
            <span className={cn('text-[10px]', dia === HOY ? 'text-ink' : 'text-faint')}>
              {etiquetaDia(dia)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * El módulo de pendientes entero: lo que no es de ningún proyecto. Se añaden
 * aquí o desde el atajo del móvil, y es la misma lista.
 */
export function Pendientes(): ReactNode {
  const { toast } = useStore()
  const [lista, setLista] = useState<Pendiente[] | null>(null)
  const [texto, setTexto] = useState('')
  // Abierto de entrada: ahora tiene columna propia y es lo que se viene a ver.
  const [verHechos, setVerHechos] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { void api.listPendientes(true).then(setLista) }, [])
  useEffect(load, [load])

  const añadir = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const limpio = texto.trim()
    if (!limpio) return
    setBusy(true)
    setTexto('')
    await api.createPendiente(limpio)
    load()
    setBusy(false)
  }

  const alternar = async (id: string): Promise<void> => {
    setBusy(true)
    await api.togglePendiente(id)
    load()
    setBusy(false)
  }

  const borrar = async (pendiente: Pendiente): Promise<void> => {
    setBusy(true)
    await api.removePendiente(pendiente.id)
    load()
    setBusy(false)
    toast('info', `Borrado «${pendiente.texto}»`)
  }

  if (!lista) return null

  const abiertos = lista.filter((p) => !p.done)
  const hechos = lista.filter((p) => p.done)

  const cuenta = porDia(hechos)
  const dias = ultimosDias(DIAS)
  const enLaQuincena = dias.reduce((suma, d) => suma + (cuenta.get(d)?.length ?? 0), 0)
  // De mayor a menor: lo de hoy primero, que es lo que uno viene a mirar.
  const conAlgo = [...cuenta.keys()].sort((a, b) => b.localeCompare(a))

  const fila = (pendiente: Pendiente): ReactNode => (
    <li key={pendiente.id}
      className="group flex items-center gap-2.5 rounded-lg border border-line bg-app/40 px-3 py-2">
      <button disabled={busy} onClick={() => void alternar(pendiente.id)}
        className={cn('relative shrink-0', pendiente.done ? 'text-brand' : 'text-faint hover:text-brand')}
        title={pendiente.done ? 'Devolver a pendientes' : 'Marcar hecho'}>
        <Circle size={16} />
        <Check size={10} className={cn('absolute left-[3px] top-[3px]',
          pendiente.done ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
      </button>

      <span className={cn('flex-1 text-[13px]', pendiente.done && 'text-faint line-through')}>
        {pendiente.texto}
      </span>

      {/* `done` llega como número: sin el Boolean, React pintaría un 0 suelto. */}
      {Boolean(pendiente.done) && pendiente.doneAt && (
        <span className="font-mono text-[11px] text-faint">{hora(pendiente.doneAt)}</span>
      )}

      <button disabled={busy} onClick={() => void borrar(pendiente)}
        className="shrink-0 text-faint opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
        title="Borrar">
        <Trash2 size={14} />
      </button>
    </li>
  )

  return (
    <Page title="Pendientes" subtitle="Lo de la vida, que no es de ningún proyecto">
      {/* En pantalla ancha, lo abierto y lo hecho van lado a lado: antes todo
          vivía en una columna estrecha con media ventana vacía al lado. */}
      <div className={cn('grid items-start gap-5',
        hechos.length > 0 ? 'max-w-6xl lg:grid-cols-2' : 'max-w-2xl')}>
        <div className="space-y-5">
        <form onSubmit={(e) => void añadir(e)} className="flex gap-2">
          <input className="field flex-1" placeholder="Añadir un pendiente…" value={texto}
            onChange={(e) => setTexto(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy || !texto.trim()}>Añadir</button>
        </form>

        <section className="card p-4">
          <h2 className="mb-3 flex items-baseline gap-2 text-[14px] font-semibold">
            Abiertos
            <span className="text-[12px] font-normal text-faint">{abiertos.length}</span>
          </h2>
          {abiertos.length === 0 ? (
            <p className="text-[12px] text-faint">Nada pendiente.</p>
          ) : (
            <ul className="space-y-1.5">{abiertos.map(fila)}</ul>
          )}
        </section>
        </div>

        {hechos.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-1 flex items-baseline gap-2 text-[14px] font-semibold">
              Hechos
              <span className="text-[12px] font-normal text-faint">
                {enLaQuincena} en {DIAS} días · {hechos.length} en total
              </span>
            </h2>

            <Grafica dias={dias} cuenta={cuenta} />

            <button className="mt-4 flex w-full items-baseline gap-2 text-left text-[13px] font-semibold"
              onClick={() => setVerHechos((v) => !v)}>
              Qué se hizo cada día
              <span className="ml-auto text-[12px] font-normal text-faint">
                {verHechos ? 'ocultar' : 'ver'}
              </span>
            </button>

            {verHechos && (
              <div className="mt-3 space-y-4">
                {conAlgo.map((dia) => (
                  <div key={dia}>
                    <h3 className="mb-1.5 flex items-baseline gap-2 border-b border-line pb-1
                      text-[12px] font-semibold first-letter:uppercase">
                      {tituloDia(dia)}
                      <span className="font-normal text-faint">{cuenta.get(dia)?.length}</span>
                    </h3>
                    <ul className="space-y-1.5">{(cuenta.get(dia) ?? []).map(fila)}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Page>
  )
}
