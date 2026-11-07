import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Circle, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { Pendiente } from '../../../shared/types'
import { Page } from '../components/Page'
import { cn, formatRelative } from '../lib/ui'

/**
 * El módulo de pendientes entero: lo que no es de ningún proyecto. Se añaden
 * aquí o desde el atajo del móvil, y es la misma lista.
 */
export function Pendientes(): ReactNode {
  const { toast } = useStore()
  const [lista, setLista] = useState<Pendiente[] | null>(null)
  const [texto, setTexto] = useState('')
  const [verHechos, setVerHechos] = useState(false)
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
        <span className="text-[11px] text-faint">{formatRelative(pendiente.doneAt)}</span>
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
      <div className="max-w-2xl space-y-5">
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

        {hechos.length > 0 && (
          <section className="card p-4">
            <button className="flex w-full items-baseline gap-2 text-left text-[14px] font-semibold"
              onClick={() => setVerHechos((v) => !v)}>
              Hechos
              <span className="text-[12px] font-normal text-faint">{hechos.length}</span>
              <span className="ml-auto text-[12px] font-normal text-faint">
                {verHechos ? 'ocultar' : 'ver'}
              </span>
            </button>
            {verHechos && <ul className="mt-3 space-y-1.5">{hechos.map(fila)}</ul>}
          </section>
        )}
      </div>
    </Page>
  )
}
