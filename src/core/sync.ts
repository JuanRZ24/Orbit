/**
 * Motor de sincronización: aplica en la base local los cambios que llegan de
 * otro equipo y resuelve los conflictos.
 *
 * La regla es último-gana por fila. Se compara la marca de tiempo del cambio
 * que llega con la de la última vez que esa fila se tocó aquí (`row_version`,
 * que cuenta tanto los cambios locales como los que ya se aplicaron de fuera);
 * si las marcas empatan desempata el identificador del equipo, de modo que
 * todos los equipos acaben en el mismo estado sin hablar entre ellos.
 */
import type { DatabaseSync } from 'node:sqlite'
import { REPLICATED, setApplying, type Change } from './replication'

/** Padres antes que hijos: al aplicar un lote no queremos pelearnos con las claves ajenas. */
export const ORDER = ['projects', 'statuses', 'epics', 'sprints', 'stories', 'tasks', 'issues', 'wiki',
  'comments', 'tags', 'activity', 'sprint_history', 'pendientes']

export interface IncomingChange {
  tbl: string
  rowId: string
  op: 'upsert' | 'delete'
  payload: string | null
  ts: string
  /** Equipo donde se originó el cambio. Solo se usa para desempatar. */
  origin: string
}

export interface ApplyReport {
  applied: number
  /** Cambios descartados porque lo que teníamos aquí era más nuevo. */
  skipped: number
  /** Cambios de tablas que este equipo no replica. */
  ignored: number
}

/** Prepara para enviar los cambios del diario local. */
export const asIncoming = (changes: Change[], origin: string): IncomingChange[] =>
  changes.map(({ tbl, rowId, op, payload, ts }) => ({ tbl, rowId, op, payload, ts, origin }))

const SEP = '\u001f'

const keyValues = (change: IncomingChange): string[] => change.rowId.split(SEP)

const whereKey = (table: string): string =>
  REPLICATED[table].key.map((k) => `${k} = ?`).join(' AND ')

function upsertSql(table: string): string {
  const { key, columns } = REPLICATED[table]
  const rest = columns.filter((c) => !key.includes(c))
  const sets = (rest.length ? rest : key).map((c) => `${c} = excluded.${c}`).join(', ')
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(${key.join(', ')}) DO UPDATE SET ${sets}`
}

type Row = Record<string, unknown>

function localRow(db: DatabaseSync, change: IncomingChange): Row | undefined {
  return db.prepare(`SELECT * FROM ${change.tbl} WHERE ${whereKey(change.tbl)}`)
    .get(...(keyValues(change) as never[])) as Row | undefined
}

interface Version {
  ts: string
  origin: string
}

function version(db: DatabaseSync, tbl: string, rowId: string): Version | undefined {
  return db.prepare('SELECT ts, origin FROM row_version WHERE tbl = ? AND rowId = ?')
    .get(tbl, rowId) as Version | undefined
}

function stamp(db: DatabaseSync, change: IncomingChange): void {
  db.prepare(
    'INSERT INTO row_version (tbl, rowId, ts, origin) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(tbl, rowId) DO UPDATE SET ts = excluded.ts, origin = excluded.origin'
  ).run(change.tbl, change.rowId, change.ts, change.origin)
}

/** ¿Gana el cambio que llega al estado que ya teníamos? */
function wins(incoming: IncomingChange, local: Version | undefined): boolean {
  if (!local) return true
  if (incoming.ts !== local.ts) return incoming.ts > local.ts
  return incoming.origin > local.origin
}

/** Compara dos valores de una fila sin tropezar con 1 frente a 1.0 ni con los nulos. */
const same = (a: unknown, b: unknown): boolean => String(a ?? null) === String(b ?? null)

/** ¿Este cambio solo mueve la fila de sitio? */
function onlyPosition(db: DatabaseSync, change: IncomingChange): boolean {
  if (!change.payload) return false
  const local = localRow(db, change)
  if (!local) return false
  const remote = JSON.parse(change.payload) as Row
  const differ = REPLICATED[change.tbl].columns.filter((c) => !same(local[c], remote[c]))
  return differ.length === 1 && differ[0] === 'position'
}

/**
 * Un reordenamiento llega como un cambio por cada fila de la lista. Para que
 * gane o pierda entero —y no fila por fila, que dejaría un orden revuelto— a
 * todas las filas del lote se les pone la marca de tiempo más alta del lote.
 * Así el último-gana de siempre decide sobre el reordenamiento completo.
 */
function withBatchStamps(db: DatabaseSync, changes: IncomingChange[]): IncomingChange[] {
  const groups = new Map<string, IncomingChange[]>()
  for (const change of changes) {
    if (change.op !== 'upsert' || !onlyPosition(db, change)) continue
    const row = JSON.parse(change.payload as string) as Row
    const scope = `${change.tbl}${SEP}${String(row.projectId ?? '')}`
    const group = groups.get(scope)
    if (group) group.push(change)
    else groups.set(scope, [change])
  }

  const newTs = new Map<IncomingChange, string>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const latest = group.reduce((max, c) => (c.ts > max ? c.ts : max), group[0].ts)
    for (const change of group) newTs.set(change, latest)
  }
  if (newTs.size === 0) return changes
  return changes.map((c) => (newTs.has(c) ? { ...c, ts: newTs.get(c) as string } : c))
}

/** Altas y cambios primero, de padres a hijos; los borrados al final, al revés. */
function sortForApply(changes: IncomingChange[]): IncomingChange[] {
  const rank = (c: IncomingChange): number => ORDER.indexOf(c.tbl)
  return [
    ...changes.filter((c) => c.op === 'upsert').sort((a, b) => rank(a) - rank(b)),
    ...changes.filter((c) => c.op === 'delete').sort((a, b) => rank(b) - rank(a))
  ]
}

export function applyChanges(db: DatabaseSync, incoming: IncomingChange[]): ApplyReport {
  const report: ApplyReport = { applied: 0, skipped: 0, ignored: 0 }
  const known = incoming.filter((c) => {
    if (REPLICATED[c.tbl] && ORDER.includes(c.tbl)) return true
    report.ignored++
    return false
  })
  if (known.length === 0) return report

  // Hay que mirar las filas locales antes de tocar nada.
  const batched = sortForApply(withBatchStamps(db, known))

  setApplying(db, true)
  db.exec('BEGIN')
  // Con las claves ajenas diferidas al commit, el orden dentro del lote no nos ata.
  db.exec('PRAGMA defer_foreign_keys = ON')
  try {
    for (const change of batched) {
      if (!wins(change, version(db, change.tbl, change.rowId))) {
        report.skipped++
        continue
      }
      if (change.op === 'delete') {
        db.prepare(`DELETE FROM ${change.tbl} WHERE ${whereKey(change.tbl)}`).run(...(keyValues(change) as never[]))
        db.prepare(
          'INSERT INTO tombstones (tbl, rowId, ts) VALUES (?, ?, ?) ON CONFLICT(tbl, rowId) DO UPDATE SET ts = excluded.ts'
        ).run(change.tbl, change.rowId, change.ts)
      } else {
        const row = JSON.parse(change.payload as string) as Row
        const values = REPLICATED[change.tbl].columns.map((c) => (row[c] ?? null) as never)
        db.prepare(upsertSql(change.tbl)).run(...values)
        db.prepare('DELETE FROM tombstones WHERE tbl = ? AND rowId = ?').run(change.tbl, change.rowId)
      }
      stamp(db, change)
      report.applied++
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    setApplying(db, false)
  }
  return report
}
