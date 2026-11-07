/**
 * El círculo completo: un servidor de verdad y dos bases locales de verdad,
 * sincronizando por HTTP hasta converger.
 *   npm run build:server && node tests/client.mjs
 *
 * Corre sin Electron. Lo único que no cubre es la interfaz.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb } from '../out/main/db.js'
import { api, openOrbit } from '../out/main/registry.js'
import { login, syncOnce } from '../out/main/client.js'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

const PUERTO = 8792
const CLAVE = 'otra-clave-de-prueba'
const url = `http://127.0.0.1:${PUERTO}`

const datos = mkdtempSync(join(tmpdir(), 'orbit-hub-'))
const dirA = mkdtempSync(join(tmpdir(), 'orbit-eq-a-'))
const dirB = mkdtempSync(join(tmpdir(), 'orbit-eq-b-'))

const servidor = spawn(process.execPath, ['out/server/index.js'], {
  env: { ...process.env, ORBIT_PORT: String(PUERTO), ORBIT_DATA: datos, ORBIT_PASSWORD: CLAVE },
  stdio: ['ignore', 'pipe', 'pipe']
})

let salida = ''
servidor.stdout.on('data', (d) => { salida += d })
servidor.stderr.on('data', (d) => { salida += d })

async function esperar() {
  for (let intento = 0; intento < 100; intento++) {
    if (servidor.exitCode !== null) throw new Error(`el servidor murió al arrancar:\n${salida}`)
    try {
      await fetch(`${url}/api/nada`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw new Error(`el servidor no respondió:\n${salida}`)
}

/** Cada equipo abre su base, hace lo suyo y la cierra: la base es un global. */
async function on(dir, fn) {
  openOrbit(dir)
  try {
    return await fn(getDb())
  } finally {
    closeDatabase()
  }
}

try {
  await esperar()

  const token = await login(url, CLAVE, 'test')
  check('el cliente consigue un token', typeof token === 'string' && token.length > 20)
  const cuenta = { url, token }

  /* ------------------------------------------------- el primer equipo sube */
  const ids = await on(dirA, async (db) => {
    const project = api['project.create']({ name: 'Compartido' })
    const story = api['story.create']({ projectId: project.id, title: 'Historia inicial', points: 5 })
    const r = await syncOnce(db, cuenta)
    check('empuja sus cambios', r.pushed > 0, `empujó ${r.pushed}`)
    eq('no se trae nada suyo de vuelta', r.applied, 0)
    eq('no deja cola pendiente', r.pending, 0)
    return { projectId: project.id, storyId: story.id }
  })

  /* --------------------------------------------- el segundo equipo baja */
  await on(dirB, async (db) => {
    const r = await syncOnce(db, cuenta)
    check('se trae lo del otro equipo', r.applied > 0, `aplicó ${r.applied}`)
    const snap = api['project.snapshot'](ids.projectId)
    check('el proyecto llegó', !!snap)
    eq('la historia llegó', snap.stories.map((s) => s.title), ['Historia inicial'])
    eq('con sus puntos', snap.stories[0].points, 5)
  })

  /* ------------------------------------------------- y devuelve un cambio */
  await on(dirB, async (db) => {
    api['story.update'](ids.storyId, { title: 'Historia corregida' })
    const r = await syncOnce(db, cuenta)
    check('empuja la corrección', r.pushed > 0)
  })

  await on(dirA, async (db) => {
    const r = await syncOnce(db, cuenta)
    check('el primer equipo recibe la corrección', r.applied > 0, `aplicó ${r.applied}`)
    eq('y el título converge',
      api['project.snapshot'](ids.projectId).stories.map((s) => s.title), ['Historia corregida'])
  })

  /* ---------------------------------------------------- la marca de agua */
  await on(dirA, async (db) => {
    const r = await syncOnce(db, cuenta)
    eq('sincronizar sin novedades no aplica nada', r.applied, 0)
    eq('ni empuja nada', r.pushed, 0)
  })

  /* --------------------------------------------------------- token malo */
  await on(dirA, async (db) => {
    const fallo = await syncOnce(db, { url, token: 'inventado' }).catch((e) => e)
    eq('un token que no vale da 401', fallo.status, 401)
    check('y lo explica en castellano', /volver a entrar/.test(fallo.message), fallo.message)
  })

  /* ------------------------------------------------------- borrar y propagar */
  await on(dirA, async (db) => {
    api['project.remove'](ids.projectId)
    await syncOnce(db, cuenta)
  })

  await on(dirB, async (db) => {
    const r = await syncOnce(db, cuenta)
    check('el borrado llega al otro equipo', r.applied > 0)
    eq('y se lleva el proyecto', api['project.snapshot'](ids.projectId), null)
    eq('con sus historias', db.prepare('SELECT count(*) AS n FROM stories').get().n, 0)
  })

  /* ------------------------------ lo que escribe el móvil llega al equipo */
  // Esto ejercita el camino del servidor como escritor: su propio diario se
  // vuelca al diario del concentrador y de ahí baja a los equipos.
  const emitir = await fetch(`${url}/api/tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ scope: 'pendientes', name: 'movil' })
  })
  const movil = (await emitir.json()).token

  const puesto = await fetch(`${url}/api/pendientes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${movil}` },
    body: JSON.stringify({ texto: 'Pendiente desde el móvil' })
  })
  eq('el móvil escribe su pendiente', puesto.status, 201)

  await on(dirB, async (db) => {
    const r = await syncOnce(db, cuenta)
    check('y el equipo se lo trae', r.applied > 0, `aplicó ${r.applied}`)
    eq('con su texto', api['pendiente.list']().map((p) => p.texto), ['Pendiente desde el móvil'])
  })
} finally {
  servidor.kill()
  await new Promise((r) => servidor.on('exit', r))
  for (const dir of [datos, dirA, dirB]) rmSync(dir, { recursive: true, force: true })
}

console.log(`\n  ${passed} comprobaciones correctas`)
if (failures.length) {
  console.log(`  ${failures.length} FALLOS:`)
  for (const f of failures) console.log(`    ✗ ${f}`)
  if (salida) console.log(`\n  salida del servidor:\n${salida}`)
}
process.exit(failures.length ? 1 : 0)
