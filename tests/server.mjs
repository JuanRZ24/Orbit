/**
 * Test del servidor de punta a punta: lo arranca de verdad, en Node pelado, y
 * le habla por HTTP como lo harían dos equipos míos.
 *   npm run build:server && node tests/server.mjs
 *
 * Que esto corra sin Electron es la prueba de que `src/core` quedó limpio.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

const PUERTO = 8791
const CLAVE = 'una-clave-de-prueba'
const base = `http://127.0.0.1:${PUERTO}`
const datos = mkdtempSync(join(tmpdir(), 'orbit-server-'))

const pedir = (ruta, { token, body, method = 'POST' } = {}) =>
  fetch(base + ruta, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

/** Una fila de proyecto válida para el esquema, montada a mano. */
const proyecto = (id, name) => ({
  id, name, slug: name.toLowerCase(), prefix: name.slice(0, 3).toUpperCase(),
  description: '', color: '#6366f1', archived: 0, refCounter: 0, position: 0,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z'
})

const upsert = (row, ts, origin) =>
  ({ tbl: 'projects', rowId: row.id, op: 'upsert', payload: JSON.stringify(row), ts, origin })

const servidor = spawn(process.execPath, ['out/server/index.js'], {
  env: { ...process.env, ORBIT_PORT: String(PUERTO), ORBIT_DATA: datos, ORBIT_PASSWORD: CLAVE },
  stdio: ['ignore', 'pipe', 'pipe']
})

let salida = ''
servidor.stdout.on('data', (d) => { salida += d })
servidor.stderr.on('data', (d) => { salida += d })

/** Espera a que conteste, sin dormir de más. */
async function esperar() {
  for (let intento = 0; intento < 100; intento++) {
    if (servidor.exitCode !== null) throw new Error(`el servidor murió al arrancar:\n${salida}`)
    try {
      await pedir('/api/nada', { method: 'GET' })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw new Error(`el servidor no respondió:\n${salida}`)
}

try {
  await esperar()

  /* ------------------------------------------------------------ rutas y auth */
  const salud = await pedir('/api/health', { method: 'GET' })
  eq('el endpoint de salud contesta sin token', salud.status, 200)
  eq('y dice lo justo', await salud.json(), { ok: true })

  eq('una ruta que no existe da 404', (await pedir('/api/nada', { method: 'GET' })).status, 404)
  eq('sincronizar sin token da 401', (await pedir('/api/sync', { body: {} })).status, 401)
  eq('la contraseña incorrecta da 401', (await pedir('/api/login', { body: { password: 'otra' } })).status, 401)

  const login = await pedir('/api/login', { body: { password: CLAVE, device: 'laptop' } })
  eq('la contraseña correcta da 200', login.status, 200)
  const { token } = await login.json()
  check('el login devuelve un token', typeof token === 'string' && token.length > 20)

  eq('un token inventado no vale', (await pedir('/api/sync', { token: 'xxx', body: {} })).status, 401)
  eq('un cuerpo mal formado da 400', (await pedir('/api/sync', { token, body: { nada: 1 } })).status, 400)
  eq('un cambio mal formado da 400',
    (await pedir('/api/sync', {
      token, body: { deviceId: 'a', since: 0, changes: [{ tbl: 'projects', rowId: 'x', op: 'upsert', payload: 'no-es-json', ts: 'x', origin: 'a' }] }
    })).status, 400)

  /* ---------------------------------------------- un equipo manda, otro recibe */
  const uno = proyecto('p-uno', 'Uno')
  const subida = await (await pedir('/api/sync', {
    token,
    body: { deviceId: 'equipo-a', since: 0, changes: [upsert(uno, '2026-11-01T10:00:00.000Z', 'equipo-a')] }
  })).json()
  eq('el servidor aplica lo que le mandan', subida.applied, 1)
  eq('no le devuelve al equipo sus propios cambios', subida.changes.length, 0)
  check('el servidor da una marca de agua', subida.serverSeq > 0)

  const bajada = await (await pedir('/api/sync', {
    token, body: { deviceId: 'equipo-b', since: 0, changes: [] }
  })).json()
  eq('el otro equipo recibe el cambio', bajada.changes.map((c) => c.rowId), ['p-uno'])
  eq('y con el origen de quien lo hizo', bajada.changes[0].origin, 'equipo-a')
  eq('el nombre viaja en el payload', JSON.parse(bajada.changes[0].payload).name, 'Uno')

  /* --------------------------------------------------------- marca de agua */
  const otraVez = await (await pedir('/api/sync', {
    token, body: { deviceId: 'equipo-b', since: bajada.serverSeq, changes: [] }
  })).json()
  eq('con la marca al día no llega nada repetido', otraVez.changes.length, 0)

  /* ----------------------------------------------------- ida y vuelta */
  const dos = proyecto('p-dos', 'Dos')
  await pedir('/api/sync', {
    token,
    body: { deviceId: 'equipo-b', since: otraVez.serverSeq, changes: [upsert(dos, '2026-11-01T11:00:00.000Z', 'equipo-b')] }
  })
  const vuelta = await (await pedir('/api/sync', {
    token, body: { deviceId: 'equipo-a', since: subida.serverSeq, changes: [] }
  })).json()
  eq('el primer equipo recibe lo del segundo', vuelta.changes.map((c) => c.rowId), ['p-dos'])

  /* ------------------------------------------------- conflicto en el servidor */
  const viejo = await (await pedir('/api/sync', {
    token,
    body: {
      deviceId: 'equipo-a', since: vuelta.serverSeq,
      changes: [upsert({ ...uno, name: 'Uno pero viejo' }, '2020-01-01T00:00:00.000Z', 'equipo-a')]
    }
  })).json()
  eq('el servidor descarta un cambio más viejo que el suyo', { a: viejo.applied, d: viejo.skipped }, { a: 0, d: 1 })

  /* ------------------------------------------------- el atajo del móvil */
  eq('pedir un token sin ser equipo da 401',
    (await pedir('/api/tokens', { token: 'xxx', body: { scope: 'pendientes' } })).status, 401)
  eq('un alcance que no se puede emitir da 400',
    (await pedir('/api/tokens', { token, body: { scope: 'full' } })).status, 400)

  const emitido = await pedir('/api/tokens', { token, body: { scope: 'pendientes', name: 'iPhone' } })
  eq('emitir el token del móvil da 201', emitido.status, 201)
  const movil = (await emitido.json()).token
  check('y devuelve un token', typeof movil === 'string' && movil.length > 20)

  eq('sin token no se escribe un pendiente',
    (await pedir('/api/pendientes', { body: { texto: 'algo' } })).status, 401)

  const creado = await pedir('/api/pendientes', { token: movil, body: { texto: '  Comprar pan ' } })
  eq('con el token del móvil sí', creado.status, 201)
  eq('y vuelve el pendiente ya recortado', (await creado.json()).texto, 'Comprar pan')
  eq('un pendiente sin texto da 400',
    (await pedir('/api/pendientes', { token: movil, body: { texto: '  ' } })).status, 400)

  // Lo que de verdad importa del alcance restringido:
  eq('el token del móvil no sirve para sincronizar',
    (await pedir('/api/sync', { token: movil, body: { deviceId: 'x', since: 0, changes: [] } })).status, 401)
  eq('ni para emitir más tokens',
    (await pedir('/api/tokens', { token: movil, body: { scope: 'pendientes' } })).status, 401)

  /* ----------------------------------------------------------- freno al login */
  let ultima = 0
  for (let i = 0; i < 6; i++) {
    ultima = (await pedir('/api/login', { body: { password: 'mala' } })).status
  }
  eq('tras varios intentos fallidos se frena', ultima, 429)
  eq('y el freno vale también para la contraseña buena',
    (await pedir('/api/login', { body: { password: CLAVE } })).status, 429)
} finally {
  servidor.kill()
  await new Promise((r) => servidor.on('exit', r))
  rmSync(datos, { recursive: true, force: true })
}

console.log(`\n  ${passed} comprobaciones correctas`)
if (failures.length) {
  console.log(`  ${failures.length} FALLOS:`)
  for (const f of failures) console.log(`    ✗ ${f}`)
  if (salida) console.log(`\n  salida del servidor:\n${salida}`)
}
process.exit(failures.length ? 1 : 0)
