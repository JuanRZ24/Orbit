/**
 * Replicación: el diario de cambios con el que la base local se sincroniza
 * contra el servidor.
 *
 * Todo lo que hay aquí es aditivo. Son tablas nuevas y triggers sobre las que
 * ya existían, así que borrando este fichero y sus objetos la base queda
 * exactamente como estaba antes de que existieran.
 */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/** Una tabla replicada: cómo se identifica una fila y qué columnas viajan. */
interface Replicated {
  key: string[]
  columns: string[]
}

/**
 * Las tablas que se sincronizan, con sus columnas tal como las declara el
 * esquema. `meta` se queda fuera a propósito: el tamaño de la ventana y el
 * token de acceso son de cada equipo, no del proyecto. El test de humo
 * comprueba que este mapa no se desfase del esquema real.
 */
export const REPLICATED: Record<string, Replicated> = {
  projects: {
    key: ['id'],
    columns: ['id', 'name', 'slug', 'prefix', 'description', 'color', 'archived', 'refCounter', 'position',
      'createdAt', 'updatedAt']
  },
  statuses: {
    key: ['id'],
    columns: ['id', 'projectId', 'kind', 'name', 'color', 'isClosed', 'wipLimit', 'position']
  },
  epics: {
    key: ['id'],
    columns: ['id', 'projectId', 'ref', 'title', 'description', 'color', 'closed', 'position', 'createdAt', 'updatedAt']
  },
  sprints: {
    key: ['id'],
    columns: ['id', 'projectId', 'name', 'goal', 'startDate', 'endDate', 'closed', 'position', 'createdAt']
  },
  stories: {
    key: ['id'],
    columns: ['id', 'projectId', 'ref', 'epicId', 'sprintId', 'statusId', 'title', 'description', 'points', 'priority',
      'blocked', 'blockedNote', 'dueDate', 'tags', 'position', 'createdAt', 'updatedAt', 'closedAt']
  },
  tasks: {
    key: ['id'],
    columns: ['id', 'projectId', 'ref', 'storyId', 'sprintId', 'statusId', 'title', 'description', 'priority',
      'blocked', 'dueDate', 'tags', 'position', 'createdAt', 'updatedAt', 'closedAt']
  },
  issues: {
    key: ['id'],
    columns: ['id', 'projectId', 'ref', 'sprintId', 'statusId', 'title', 'description', 'type', 'severity', 'priority',
      'blocked', 'dueDate', 'tags', 'position', 'createdAt', 'updatedAt', 'closedAt']
  },
  wiki: {
    key: ['id'],
    columns: ['id', 'projectId', 'slug', 'title', 'content', 'position', 'createdAt', 'updatedAt']
  },
  comments: {
    key: ['id'],
    columns: ['id', 'projectId', 'entityKind', 'entityId', 'body', 'createdAt']
  },
  tags: {
    key: ['projectId', 'name'],
    columns: ['projectId', 'name', 'color']
  },
  activity: {
    key: ['id'],
    columns: ['id', 'projectId', 'entityKind', 'entityId', 'entityRef', 'entityTitle', 'action', 'detail', 'createdAt']
  },
  sprint_history: {
    key: ['sprintId', 'date'],
    columns: ['sprintId', 'date', 'remainingPoints', 'totalPoints']
  },
  pendientes: {
    key: ['id'],
    columns: ['id', 'texto', 'done', 'position', 'createdAt', 'updatedAt', 'doneAt']
  }
}

const TABLES = `
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

/** Diario de cambios locales. Lo llenan los triggers, nadie lo escribe a mano. */
CREATE TABLE IF NOT EXISTS change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL,
  rowId TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT,
  ts TEXT NOT NULL,
  pushedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_log_pending ON change_log(pushedAt, seq);
CREATE INDEX IF NOT EXISTS idx_change_log_row ON change_log(tbl, rowId, seq);

/** Borrados, para que una fila eliminada no reaparezca al sincronizar. */
CREATE TABLE IF NOT EXISTS tombstones (
  tbl TEXT NOT NULL,
  rowId TEXT NOT NULL,
  ts TEXT NOT NULL,
  PRIMARY KEY (tbl, rowId)
);

/**
 * Cuándo y dónde se tocó cada fila por última vez, venga el cambio de este
 * equipo o de otro. Es lo que decide quién gana un conflicto, y por eso lo
 * escriben tanto los triggers como el motor al aplicar cambios remotos.
 */
CREATE TABLE IF NOT EXISTS row_version (
  tbl TEXT NOT NULL,
  rowId TEXT NOT NULL,
  ts TEXT NOT NULL,
  origin TEXT NOT NULL,
  PRIMARY KEY (tbl, rowId)
);
`

/**
 * Mientras el motor aplica cambios que vienen del servidor, los triggers se
 * callan: si no, reenviaríamos al servidor lo que acaba de llegar de él.
 * Si la fila de la bandera no existe se registra igual, que es el lado seguro.
 */
const GUARD = `COALESCE((SELECT value FROM sync_state WHERE key = 'applying'), '0') = '0'`

const STAMP = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

const LOCAL = `COALESCE((SELECT value FROM sync_state WHERE key = 'deviceId'), '')`

/** Deja constancia de que esta fila se tocó aquí y ahora. */
const touch = (table: string, id: string): string => `
  INSERT INTO row_version (tbl, rowId, ts, origin)
  VALUES ('${table}', ${id}, ${STAMP}, ${LOCAL})
  ON CONFLICT(tbl, rowId) DO UPDATE SET ts = excluded.ts, origin = excluded.origin;`

/**
 * Identificador de fila: la llave, o sus partes unidas por un separador. Sin
 * alias es la propia tabla, que es como lo necesita el volcado inicial.
 */
const rowId = (alias: 'new' | 'old' | null, key: string[]): string =>
  key.map((k) => (alias ? `${alias}.${k}` : k)).join(' || char(31) || ')

const payload = (columns: string[], alias: 'new' | null = 'new'): string =>
  `json_object(${columns.map((c) => `'${c}', ${alias ? `${alias}.${c}` : c}`).join(', ')})`

/**
 * Los tres triggers de una tabla. El de UPDATE registra la llave nueva; en las
 * tablas de llave compuesta nadie modifica la llave en su sitio (las etiquetas
 * se borran y se vuelven a insertar), así que no hace falta cubrir ese caso.
 */
function triggersFor(table: string, { key, columns }: Replicated): string {
  return `
CREATE TRIGGER IF NOT EXISTS cl_${table}_ai AFTER INSERT ON ${table}
WHEN ${GUARD}
BEGIN
  INSERT INTO change_log (tbl, rowId, op, payload, ts)
  VALUES ('${table}', ${rowId('new', key)}, 'upsert', ${payload(columns)}, ${STAMP});
  ${touch(table, rowId('new', key))}
END;

CREATE TRIGGER IF NOT EXISTS cl_${table}_au AFTER UPDATE ON ${table}
WHEN ${GUARD}
BEGIN
  INSERT INTO change_log (tbl, rowId, op, payload, ts)
  VALUES ('${table}', ${rowId('new', key)}, 'upsert', ${payload(columns)}, ${STAMP});
  ${touch(table, rowId('new', key))}
END;

CREATE TRIGGER IF NOT EXISTS cl_${table}_ad AFTER DELETE ON ${table}
WHEN ${GUARD}
BEGIN
  INSERT INTO change_log (tbl, rowId, op, payload, ts)
  VALUES ('${table}', ${rowId('old', key)}, 'delete', NULL, ${STAMP});
  INSERT INTO tombstones (tbl, rowId, ts)
  VALUES ('${table}', ${rowId('old', key)}, ${STAMP})
  ON CONFLICT(tbl, rowId) DO UPDATE SET ts = excluded.ts;
  ${touch(table, rowId('old', key))}
END;
`
}

export interface Change {
  seq: number
  tbl: string
  rowId: string
  op: 'upsert' | 'delete'
  payload: string | null
  ts: string
}

/**
 * Mete en el diario lo que ya estaba en la base antes de que existieran los
 * triggers.
 *
 * Sin esto, una base con años de proyectos dentro se sincronizaría como si
 * estuviera vacía: los triggers solo ven lo que pasa a partir de su creación.
 * Y es peor que perder datos en silencio — al editar una historia vieja se
 * empujaría al servidor una fila cuyo proyecto nunca viajó, y la clave ajena
 * revienta allí, dejando la sincronización atascada para siempre.
 *
 * Las tablas se recorren en el orden de `REPLICATED`, que va de padres a
 * hijos, así que el `seq` del diario ya sale en orden de dependencia.
 *
 * Los upserts que estaban en cola se tiran antes: el volcado es la foto
 * completa de la base ahora mismo, así que los repite todos, y si se dejaran
 * tendrían un `seq` más bajo y se enviarían en un lote anterior al de sus
 * propios padres. Los borrados sí se quedan: de esos no hay fila que volcar.
 */
function backfill(db: DatabaseSync): void {
  db.exec("DELETE FROM change_log WHERE pushedAt IS NULL AND op = 'upsert'")
  for (const [table, { key, columns }] of Object.entries(REPLICATED)) {
    const id = rowId(null, key)
    db.exec(`
      INSERT INTO change_log (tbl, rowId, op, payload, ts)
      SELECT '${table}', ${id}, 'upsert', ${payload(columns, null)}, ${STAMP} FROM ${table};

      -- El WHERE no sobra: sin él, SQLite no sabe si el ON CONFLICT es del
      -- SELECT o del INSERT, y se niega a analizar la sentencia.
      INSERT INTO row_version (tbl, rowId, ts, origin)
      SELECT '${table}', ${id}, ${STAMP}, ${LOCAL} FROM ${table} WHERE true
      ON CONFLICT(tbl, rowId) DO UPDATE SET ts = excluded.ts, origin = excluded.origin;
    `)
  }
}

export function installReplication(db: DatabaseSync): void {
  db.exec(TABLES)
  for (const [table, spec] of Object.entries(REPLICATED)) db.exec(triggersFor(table, spec))
  if (!readState(db, 'deviceId')) writeState(db, 'deviceId', randomUUID())
  // Una caída a media aplicación no debe dejar los triggers mudos para siempre.
  writeState(db, 'applying', '0')
  // El volcado inicial va una sola vez, y después de fijar el deviceId: si no,
  // `row_version` nacería con el origen en blanco.
  if (!readState(db, 'backfilled')) {
    backfill(db)
    writeState(db, 'backfilled', '1')
  }
}

export function readState(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function writeState(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

/** Silencia los triggers mientras se aplican cambios remotos. */
export function setApplying(db: DatabaseSync, applying: boolean): void {
  writeState(db, 'applying', applying ? '1' : '0')
}

/** Cambios locales que el servidor todavía no ha visto, en orden. */
export function pendingChanges(db: DatabaseSync, limit = 500): Change[] {
  return db.prepare(
    'SELECT seq, tbl, rowId, op, payload, ts FROM change_log WHERE pushedAt IS NULL ORDER BY seq LIMIT ?'
  ).all(limit) as unknown as Change[]
}

/** Marca como enviado todo el lote hasta `upToSeq` inclusive. */
export function markPushed(db: DatabaseSync, upToSeq: number): void {
  db.prepare(`UPDATE change_log SET pushedAt = ${STAMP} WHERE pushedAt IS NULL AND seq <= ?`).run(upToSeq)
}
