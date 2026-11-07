/**
 * Autenticación del servidor: un solo usuario (yo) y tokens revocables.
 *
 * Estas tablas viven solo en la base del servidor y no se replican nunca: no
 * están en el mapa de `core/replication.ts`, así que ningún token viaja a los
 * equipos. La contraseña se siembra al arrancar desde ORBIT_PASSWORD, que es
 * lo que evita tener un endpoint de registro abierto en internet.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

/** `full` es un equipo mío; `pendientes` es el atajo del móvil y poco más. */
export type Scope = 'full' | 'pendientes'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  passwordHash TEXT NOT NULL,
  salt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

/** Del token se guarda el resumen, nunca el token. */
CREATE TABLE IF NOT EXISTS app_token (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  lastUsedAt TEXT
);
`

const now = (): string => new Date().toISOString()

const derive = (password: string, salt: string): Buffer => scryptSync(password, salt, 64)

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

export function installAuth(db: DatabaseSync, password: string | undefined): void {
  db.exec(SCHEMA)
  const row = db.prepare('SELECT count(*) AS n FROM app_user').get() as { n: number }
  if (row.n > 0) return
  if (!password) {
    throw new Error('No hay usuario todavía y falta ORBIT_PASSWORD para crearlo')
  }
  setPassword(db, password)
}

export function setPassword(db: DatabaseSync, password: string): void {
  const salt = randomBytes(16).toString('hex')
  db.prepare(
    'INSERT INTO app_user (id, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET passwordHash = excluded.passwordHash, salt = excluded.salt'
  ).run('me', derive(password, salt).toString('hex'), salt, now())
}

export function checkPassword(db: DatabaseSync, password: unknown): boolean {
  if (typeof password !== 'string' || password.length === 0) return false
  const row = db.prepare('SELECT passwordHash, salt FROM app_user WHERE id = ?').get('me') as
    { passwordHash: string; salt: string } | undefined
  if (!row) return false
  const guardado = Buffer.from(row.passwordHash, 'hex')
  const intento = derive(password, row.salt)
  return guardado.length === intento.length && timingSafeEqual(guardado, intento)
}

export function issueToken(db: DatabaseSync, name: string, scope: Scope): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO app_token (id, hash, name, scope, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), digest(token), name, scope, now())
  return token
}

/** El alcance del token, o null si no vale. */
export function scopeOf(db: DatabaseSync, token: string | null): Scope | null {
  if (!token) return null
  const row = db.prepare('SELECT id, scope FROM app_token WHERE hash = ?').get(digest(token)) as
    { id: string; scope: Scope } | undefined
  if (!row) return null
  db.prepare('UPDATE app_token SET lastUsedAt = ? WHERE id = ?').run(now(), row.id)
  return row.scope
}

export const bearer = (header: string | undefined): string | null => {
  const match = /^Bearer (.+)$/.exec(header ?? '')
  return match ? match[1] : null
}

/* ------------------------------------------------------------------ freno */

const INTENTOS = 5
const CASTIGO = 5 * 60 * 1000

const fallos = new Map<string, { n: number; hasta: number }>()

/** ¿Puede este origen volver a probar contraseña? */
export function mayTry(ip: string, ahora = Date.now()): boolean {
  const registro = fallos.get(ip)
  if (!registro) return true
  // Sin castigo puesto solo estamos contando fallos; el registro se queda.
  if (registro.hasta === 0) return true
  if (registro.hasta > ahora) return false
  fallos.delete(ip)
  return true
}

export function loginFailed(ip: string, ahora = Date.now()): void {
  // El mapa no puede crecer sin tope: si se desmadra, fuera los castigos cumplidos.
  if (fallos.size > 1000) {
    for (const [otro, r] of fallos) if (r.hasta !== 0 && r.hasta <= ahora) fallos.delete(otro)
  }
  const registro = fallos.get(ip) ?? { n: 0, hasta: 0 }
  registro.n += 1
  if (registro.n >= INTENTOS) {
    registro.n = 0
    registro.hasta = ahora + CASTIGO
  }
  fallos.set(ip, registro)
}

export const loginOk = (ip: string): void => void fallos.delete(ip)
