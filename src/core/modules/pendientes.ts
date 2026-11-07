/**
 * Módulo de pendientes: las cosas de la vida que no son un proyecto.
 *
 * No cuelgan de ningún proyecto, son una lista global y mía. El campo de texto
 * se llama `texto` porque así entra por la API del atajo del móvil; el resto de
 * columnas sigue la convención del esquema de Orbit, y `position` tiene que
 * llamarse exactamente así para que el motor de sincronización trate un
 * reordenamiento como un lote.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import type { Pendiente } from '../../shared/types'

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS pendientes (
  id TEXT PRIMARY KEY,
  texto TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  doneAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_pendientes_abiertos ON pendientes(done, position);
`

/** Lo que manda el móvil no se guarda sin recortar. */
const LARGO = 500

const now = (): string => new Date().toISOString()

const get = (id: string): Pendiente | undefined =>
  getDb().prepare('SELECT * FROM pendientes WHERE id = ?').get(id) as unknown as Pendiente | undefined

export const api = {
  /** Da de alta un pendiente. Es lo que llama el atajo del móvil. */
  'pendiente.create': (input: { texto?: unknown }): Pendiente => {
    const texto = typeof input?.texto === 'string' ? input.texto.trim() : ''
    if (texto.length === 0) throw new Error('El pendiente necesita un texto')

    const db = getDb()
    const hueco = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM pendientes').get() as { p: number }
    const id = randomUUID()
    const stamp = now()
    db.prepare(
      'INSERT INTO pendientes (id, texto, done, position, createdAt, updatedAt) VALUES (?, ?, 0, ?, ?, ?)'
    ).run(id, texto.slice(0, LARGO), hueco.p + 1, stamp, stamp)
    return get(id) as Pendiente
  },

  'pendiente.list': (options?: { includeDone?: boolean }): Pendiente[] =>
    getDb().prepare(
      options?.includeDone
        ? 'SELECT * FROM pendientes ORDER BY done, position'
        : 'SELECT * FROM pendientes WHERE done = 0 ORDER BY position'
    ).all() as unknown as Pendiente[],

  /** Marca hecho, o lo desmarca. */
  'pendiente.toggle': (id: string): Pendiente | undefined => {
    const actual = get(id)
    if (!actual) return undefined
    const done = actual.done ? 0 : 1
    const stamp = now()
    getDb().prepare('UPDATE pendientes SET done = ?, doneAt = ?, updatedAt = ? WHERE id = ?')
      .run(done, done ? stamp : null, stamp, id)
    return get(id)
  },

  'pendiente.remove': (id: string): void => {
    getDb().prepare('DELETE FROM pendientes WHERE id = ?').run(id)
  }
}
