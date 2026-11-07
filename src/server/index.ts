/**
 * El servidor de Orbit: Node pelado, sin dependencias y sin Electron.
 *
 *   ORBIT_PASSWORD=… ORBIT_DATA=/datos ORBIT_PORT=8787 node out/server/index.js
 *
 * Solo expone dos rutas, y una de ellas pide token. Esto va a estar en
 * internet, así que todo lo que no sea el login exige credencial.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { closeDatabase } from '../core/db'
import { api, openOrbit } from '../core/modules/registry'
import type { DatabaseSync } from 'node:sqlite'
import type { IncomingChange } from '../core/sync'
import {
  bearer, checkPassword, installAuth, issueToken, loginFailed, loginOk, mayTry, scopeOf
} from './auth'
import { installHub, sync, type SyncRequest } from './hub'

const PUERTO = Number(process.env.ORBIT_PORT ?? 8787)
const DATOS = process.env.ORBIT_DATA ?? '/datos'
const LIMITE = 8 * 1024 * 1024

function json(res: ServerResponse, status: number, body: unknown): void {
  const cuerpo = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(cuerpo)
  })
  res.end(cuerpo)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const trozos: Buffer[] = []
  let total = 0
  for await (const trozo of req) {
    total += (trozo as Buffer).length
    if (total > LIMITE) throw new Error('cuerpo demasiado grande')
    trozos.push(trozo as Buffer)
  }
  return total === 0 ? null : JSON.parse(Buffer.concat(trozos).toString('utf8'))
}

/** Un cambio bien formado. Lo que llega de fuera no se cree sin mirarlo. */
function esCambio(value: unknown): value is IncomingChange {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  if (typeof c.tbl !== 'string' || typeof c.rowId !== 'string') return false
  if (c.op !== 'upsert' && c.op !== 'delete') return false
  if (typeof c.ts !== 'string' || typeof c.origin !== 'string') return false
  if (c.op === 'delete') return c.payload === null || c.payload === undefined
  if (typeof c.payload !== 'string') return false
  try {
    const fila = JSON.parse(c.payload)
    return typeof fila === 'object' && fila !== null && !Array.isArray(fila)
  } catch {
    return false
  }
}

function esPeticion(value: unknown): value is SyncRequest {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return typeof r.deviceId === 'string' && r.deviceId.length > 0 &&
    typeof r.since === 'number' && Number.isInteger(r.since) && r.since >= 0 &&
    Array.isArray(r.changes) && r.changes.every(esCambio)
}

async function route(db: DatabaseSync, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ruta = new URL(req.url ?? '/', 'http://local').pathname

  // Lo único sin token. Devuelve una constante: no dice ni versión ni estado,
  // solo que el proceso está en pie, que es lo que necesita Docker.
  if (req.method === 'GET' && ruta === '/api/health') {
    return json(res, 200, { ok: true })
  }

  if (req.method === 'POST' && ruta === '/api/login') {
    // Detrás de un proxy esto es la IP del proxy, así que el freno es de hecho
    // global. Para un servidor de un solo usuario sale a favor.
    const origen = req.socket.remoteAddress ?? 'desconocido'
    if (!mayTry(origen)) return json(res, 429, { error: 'demasiados intentos, espera un rato' })

    const cuerpo = await readJson(req) as { password?: unknown; device?: unknown } | null
    if (!checkPassword(db, cuerpo?.password)) {
      loginFailed(origen)
      return json(res, 401, { error: 'credenciales incorrectas' })
    }
    loginOk(origen)
    const nombre = typeof cuerpo?.device === 'string' ? cuerpo.device.slice(0, 60) : 'equipo'
    return json(res, 200, { token: issueToken(db, nombre, 'full') })
  }

  if (req.method === 'POST' && ruta === '/api/sync') {
    if (scopeOf(db, bearer(req.headers.authorization)) !== 'full') {
      return json(res, 401, { error: 'hace falta un token de equipo' })
    }
    const cuerpo = await readJson(req)
    if (!esPeticion(cuerpo)) return json(res, 400, { error: 'petición mal formada' })
    return json(res, 200, sync(db, cuerpo))
  }

  // Lo que escribe el atajo del móvil. Queda en el diario del servidor y los
  // equipos se lo llevan en la siguiente sincronización.
  if (req.method === 'POST' && ruta === '/api/pendientes') {
    const alcance = scopeOf(db, bearer(req.headers.authorization))
    if (alcance !== 'full' && alcance !== 'pendientes') {
      return json(res, 401, { error: 'hace falta un token' })
    }
    const cuerpo = await readJson(req) as { texto?: unknown } | null
    try {
      return json(res, 201, api['pendiente.create']({ texto: cuerpo?.texto }))
    } catch (error) {
      return json(res, 400, { error: (error as Error).message })
    }
  }

  // Emitir el token del móvil pide un token de equipo. Uno `full` solo sale del
  // login con contraseña: así un token robado del móvil no engendra otros.
  if (req.method === 'POST' && ruta === '/api/tokens') {
    if (scopeOf(db, bearer(req.headers.authorization)) !== 'full') {
      return json(res, 401, { error: 'hace falta un token de equipo' })
    }
    const cuerpo = await readJson(req) as { name?: unknown; scope?: unknown } | null
    if (cuerpo?.scope !== 'pendientes') {
      return json(res, 400, { error: 'el alcance tiene que ser "pendientes"' })
    }
    const nombre = typeof cuerpo.name === 'string' && cuerpo.name.trim()
      ? cuerpo.name.trim().slice(0, 60)
      : 'móvil'
    return json(res, 201, { token: issueToken(db, nombre, 'pendientes') })
  }

  json(res, 404, { error: 'no existe' })
}

const db = openOrbit(DATOS)
installAuth(db, process.env.ORBIT_PASSWORD)
installHub(db)

const server = createServer((req, res) => {
  route(db, req, res).catch((error) => {
    // Hacia fuera nunca van los detalles; al log sí.
    console.error('fallo atendiendo', req.method, req.url, error)
    if (!res.headersSent) json(res, 500, { error: 'algo falló' })
  })
})

server.listen(PUERTO, () => console.log(`orbit escuchando en ${PUERTO}, datos en ${DATOS}`))

for (const señal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(señal, () => {
    server.close(() => {
      closeDatabase()
      process.exit(0)
    })
  })
}
