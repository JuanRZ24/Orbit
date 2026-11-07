/**
 * El concentrador: el servidor es el único punto por el que pasan los cambios.
 * Nadie habla con nadie, todos hablan con él, y él les asigna un número de
 * orden propio que es la marca de agua con la que cada equipo sabe por dónde
 * se quedó.
 */
import type { DatabaseSync } from 'node:sqlite'
import { markPushed, pendingChanges, readState } from '../core/replication'
import { applyChanges, type IncomingChange } from '../core/sync'

const SCHEMA = `
/** Todos los cambios que han pasado por aquí, en el orden en que llegaron. */
CREATE TABLE IF NOT EXISTS server_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL,
  rowId TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT,
  ts TEXT NOT NULL,
  origin TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_server_changes_origin ON server_changes(seq, origin);
`

export function installHub(db: DatabaseSync): void {
  db.exec(SCHEMA)
}

export interface SyncRequest {
  deviceId: string
  since: number
  changes: IncomingChange[]
}

export interface SyncResponse {
  serverSeq: number
  changes: IncomingChange[]
  /** Qué hizo el servidor con lo que le mandamos. */
  applied: number
  skipped: number
}

function record(db: DatabaseSync, changes: IncomingChange[], fallback: string): void {
  const stmt = db.prepare(
    'INSERT INTO server_changes (tbl, rowId, op, payload, ts, origin) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const c of changes) stmt.run(c.tbl, c.rowId, c.op, c.payload, c.ts, c.origin || fallback)
}

/**
 * Lo que se haya escrito en el propio servidor —el atajo del móvil, por
 * ejemplo— también tiene que llegar a los equipos, así que su diario local se
 * vuelca aquí con el servidor como origen.
 */
function drainLocal(db: DatabaseSync): void {
  const mios = pendingChanges(db, 5000)
  if (mios.length === 0) return
  record(db, mios.map((c) => ({ ...c, origin: readState(db, 'deviceId') ?? 'server' })), 'server')
  markPushed(db, mios[mios.length - 1].seq)
}

export function sync(db: DatabaseSync, request: SyncRequest): SyncResponse {
  const report = applyChanges(db, request.changes)
  // Se anota todo lo que llegó, aplicado o no: con el último-gana en cada
  // equipo, un cambio que aquí perdió también pierde allí, y así ninguno se
  // queda sin ver algo que otro equipo sí vio.
  record(db, request.changes, request.deviceId)
  drainLocal(db)

  const tope = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM server_changes').get() as { s: number }).s
  const changes = db.prepare(
    'SELECT tbl, rowId, op, payload, ts, origin FROM server_changes ' +
    'WHERE seq > ? AND seq <= ? AND origin <> ? ORDER BY seq'
  ).all(request.since, tope, request.deviceId) as unknown as IncomingChange[]

  return { serverSeq: tope, changes, applied: report.applied, skipped: report.skipped }
}
