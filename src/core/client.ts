/**
 * El lado cliente de la sincronización: empuja lo que este equipo tiene
 * pendiente, se trae lo que haya en el servidor y lo aplica.
 *
 * Vive en `core` porque no necesita nada de Electron, y así se puede probar
 * contra un servidor de verdad sin arrancar la aplicación.
 */
import type { DatabaseSync } from 'node:sqlite'
import type { ServerConfig, SyncResult } from '../shared/sync'
import { markPushed, pendingChanges, readState, writeState } from './replication'
import { applyChanges, asIncoming, type IncomingChange } from './sync'

export type { ServerConfig, SyncResult }

/** Un fallo de red o del servidor, con el código para poder distinguirlo. */
export class SyncError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SyncError'
    this.status = status
  }
}

const LOTE = 500

const base = (url: string): string => url.replace(/\/+$/, '')

function explica(status: number): string {
  if (status === 401) return 'el token no vale; hay que volver a entrar'
  if (status === 429) return 'demasiados intentos, espera un rato'
  if (status >= 500) return 'el servidor falló'
  return `el servidor respondió ${status}`
}

async function post(url: string, body: unknown, token?: string): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
  } catch (error) {
    throw new SyncError(0, `no se pudo contactar con el servidor: ${(error as Error).message}`)
  }
  if (!respuesta.ok) throw new SyncError(respuesta.status, explica(respuesta.status))
  return respuesta.json()
}

/** Cambia contraseña por token. El token es lo único que se guarda después. */
export async function login(url: string, password: string, device: string): Promise<string> {
  let cuerpo: { token?: unknown }
  try {
    cuerpo = await post(`${base(url)}/api/login`, { password, device }) as { token?: unknown }
  } catch (error) {
    // Aquí todavía no hay token: un 401 solo puede ser la contraseña, y decir
    // «vuelve a entrar» a quien está entrando no ayuda a nadie.
    if (error instanceof SyncError && error.status === 401) {
      throw new SyncError(401, 'la contraseña no es la del servidor')
    }
    throw error
  }
  if (typeof cuerpo?.token !== 'string') throw new SyncError(0, 'el servidor no devolvió un token')
  return cuerpo.token
}

interface Respuesta {
  serverSeq: number
  changes: IncomingChange[]
  applied: number
  skipped: number
}

function valida(value: unknown): Respuesta {
  const r = value as Partial<Respuesta> | null
  if (!r || typeof r.serverSeq !== 'number' || !Array.isArray(r.changes) ||
    typeof r.applied !== 'number' || typeof r.skipped !== 'number') {
    throw new SyncError(0, 'el servidor contestó algo que no entiendo')
  }
  return r as Respuesta
}

/** Una pasada de sincronización. */
export async function syncOnce(db: DatabaseSync, config: ServerConfig): Promise<SyncResult> {
  const deviceId = readState(db, 'deviceId')
  if (!deviceId) throw new SyncError(0, 'esta base no tiene identificador de equipo')

  const since = Number(readState(db, 'serverSeq') ?? 0)
  const mios = pendingChanges(db, LOTE)

  const cuerpo = valida(await post(
    `${base(config.url)}/api/sync`,
    { deviceId, since, changes: asIncoming(mios, deviceId) },
    config.token
  ))

  // El orden importa: lo nuestro no se da por enviado hasta que el servidor
  // lo confirma, y la marca de agua no avanza hasta haber aplicado lo suyo.
  const informe = applyChanges(db, cuerpo.changes)
  if (mios.length) markPushed(db, mios[mios.length - 1].seq)
  writeState(db, 'serverSeq', String(cuerpo.serverSeq))

  return {
    pushed: cuerpo.applied,
    rejected: cuerpo.skipped,
    applied: informe.applied,
    skipped: informe.skipped,
    serverSeq: cuerpo.serverSeq,
    pending: pendingChanges(db, LOTE).length
  }
}

/** Sincroniza hasta vaciar la cola, con un tope por si algo se atasca. */
export async function syncUntilDone(db: DatabaseSync, config: ServerConfig, vueltas = 10): Promise<SyncResult> {
  let resultado = await syncOnce(db, config)
  let total = { ...resultado }
  for (let i = 1; i < vueltas && resultado.pending > 0; i++) {
    resultado = await syncOnce(db, config)
    total = {
      ...resultado,
      pushed: total.pushed + resultado.pushed,
      rejected: total.rejected + resultado.rejected,
      applied: total.applied + resultado.applied,
      skipped: total.skipped + resultado.skipped
    }
  }
  return total
}
