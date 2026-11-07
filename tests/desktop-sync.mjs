/**
 * La capa de la aplicación: dónde se guarda la cuenta, si el token sobrevive
 * al llavero del sistema, y qué contesta el puente al renderer.
 *   electron tests/desktop-sync.mjs
 *
 * Corre bajo Electron porque `safeStorage` solo existe ahí, que es justo lo
 * que hay que comprobar.
 */
import { app, safeStorage } from 'electron'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase } from '../out/main/db.js'
import { api, openOrbit } from '../out/main/registry.js'
import { isRunning, readConfig, signIn, signOut, start, status, stop, syncNow } from '../out/main/desktopSync.js'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

const PUERTO = 8793
const CLAVE = 'clave-del-escritorio'
const url = `http://127.0.0.1:${PUERTO}`

const datos = mkdtempSync(join(tmpdir(), 'orbit-hub2-'))
const local = mkdtempSync(join(tmpdir(), 'orbit-local-'))

let salida = ''
let servidor

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

app.whenReady().then(async () => {
  servidor = spawn(process.execPath, ['out/server/index.js'], {
    env: {
      ...process.env, ORBIT_PORT: String(PUERTO), ORBIT_DATA: datos, ORBIT_PASSWORD: CLAVE,
      // Electron tiene que arrancar como Node para poder correr el servidor.
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  servidor.stdout.on('data', (d) => { salida += d })
  servidor.stderr.on('data', (d) => { salida += d })

  try {
    await esperar()
    openOrbit(local)

    /* --------------------------------------------- lo que no debe pasar */
    eq('sin cuenta no se puede sincronizar',
      (await syncNow()).error, 'todavía no has entrado en el servidor')
    eq('una dirección que no es una URL se rechaza',
      (await signIn('midominio', CLAVE)).error, 'la dirección del servidor no vale')
    eq('sin contraseña no se intenta', (await signIn(url, '')).error, 'falta la contraseña')
    eq('la contraseña incorrecta no guarda nada', (await signIn(url, 'otra')).ok, false)
    eq('y la cuenta sigue sin configurar', (await status()).configured, false)

    /* ------------------------------------------------------------ entrar */
    const entrada = await signIn(url, CLAVE)
    eq('con la contraseña buena entra', entrada.ok, true)
    check('entrar ya sincroniza', entrada.result !== undefined)

    const estado = await status()
    eq('la cuenta queda configurada', estado.configured, true)
    eq('se recuerda la dirección', estado.url, url)
    check('se apunta la hora', typeof estado.lastAt === 'string')
    eq('sin errores', estado.lastError, null)
    eq('el estado del llavero es el real del sistema',
      estado.tokenEncrypted, await safeStorage.isAsyncEncryptionAvailable())

    /* ------------------------------------------- el token va y vuelve */
    check('hay token guardado', ((await readConfig())?.token ?? '').length > 20)
    closeDatabase()
    openOrbit(local)
    const recuperada = await readConfig()
    check('el token sobrevive a cerrar y abrir la base', (recuperada?.token ?? '').length > 20)
    eq('y la dirección también', recuperada?.url, url)

    /* ------------------------------------------------ sincronizar de verdad */
    api['project.create']({ name: 'Desde el escritorio' })
    const subida = await syncNow()
    eq('sincronizar sale bien', subida.ok, true)
    check('y empuja lo que había', subida.result.pushed > 0, `empujó ${subida.result?.pushed}`)

    const alDia = await syncNow()
    eq('repetir no empuja nada', alDia.result.pushed, 0)
    eq('ni recibe nada', alDia.result.applied, 0)

    /* ---------------------------------------------------------- desconectar */
    signOut()
    eq('al desconectar se olvida la cuenta', (await status()).configured, false)
    eq('y la dirección se borra', (await status()).url, null)
    eq('ya no se puede sincronizar',
      (await syncNow()).error, 'todavía no has entrado en el servidor')
    await start()
    eq('arrancar el ciclo sin cuenta no lo pone en marcha', isRunning(), false)
  } catch (error) {
    failures.push(`excepción: ${error.message}`)
  } finally {
    stop()
    servidor.kill()
    await new Promise((r) => servidor.on('exit', r))
    closeDatabase()
    for (const dir of [datos, local]) rmSync(dir, { recursive: true, force: true })
  }

  console.log(`\n  ${passed} comprobaciones correctas`)
  if (failures.length) {
    console.log(`  ${failures.length} FALLOS:`)
    for (const f of failures) console.log(`    ✗ ${f}`)
    if (salida) console.log(`\n  salida del servidor:\n${salida}`)
  }
  app.exit(failures.length ? 1 : 0)
})
