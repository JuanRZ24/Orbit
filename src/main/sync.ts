/**
 * La sincronización vista desde la aplicación: dónde se guarda la cuenta, cada
 * cuánto se sincroniza y qué se le cuenta al renderer.
 *
 * El token se guarda en el llavero del sistema cuando lo hay. Si no, va en
 * claro en la tabla `meta`, que es local y nunca se replica; `status()` lo dice
 * para que la interfaz pueda avisarlo.
 *
 * Todo lo que toca el llavero es asíncrono a propósito: las versiones
 * sincrónicas de `safeStorage` están deprecadas en Electron 45.
 */
import { safeStorage } from 'electron'
import { hostname } from 'node:os'
import { getDb, getMeta, setMeta } from '../core/db'
import { login as loginRemoto, SyncError, syncUntilDone } from '../core/client'
import type { ServerConfig, SyncOutcome, SyncStatus } from '../shared/sync'

const INTERVALO = 60_000

let avisar: (() => void) | null = null
let temporizador: ReturnType<typeof setInterval> | null = null
let enCurso: Promise<SyncOutcome> | null = null
let ultimaVez: string | null = null
let ultimoError: string | null = null

async function guardaToken(token: string): Promise<void> {
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    const cifrado = await safeStorage.encryptStringAsync(token)
    setMeta('server.token', cifrado.toString('base64'))
    setMeta('server.tokenEncrypted', '1')
    return
  }
  setMeta('server.token', token)
  setMeta('server.tokenEncrypted', '0')
}

async function leeToken(): Promise<string | null> {
  const guardado = getMeta('server.token')
  if (!guardado) return null
  if (getMeta('server.tokenEncrypted') !== '1') return guardado
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(guardado, 'base64'))
    // El sistema rotó su clave: hay que volver a guardarlo con la nueva.
    if (shouldReEncrypt) await guardaToken(result)
    return result
  } catch {
    // Otro llavero u otro perfil: el token ya no se puede leer, toca entrar otra vez.
    return null
  }
}

export async function readConfig(): Promise<ServerConfig | null> {
  const url = getMeta('server.url')
  const token = await leeToken()
  return url && token ? { url, token } : null
}

const mensajeDe = (error: unknown): string =>
  error instanceof SyncError ? error.message : (error as Error).message

/** Una sincronización. Si ya hay una en marcha, se devuelve esa misma. */
export function syncNow(): Promise<SyncOutcome> {
  if (enCurso) return enCurso

  enCurso = (async () => {
    try {
      const config = await readConfig()
      if (!config) return { ok: false, error: 'todavía no has entrado en el servidor' }
      const result = await syncUntilDone(getDb(), config)
      ultimaVez = new Date().toISOString()
      ultimoError = null
      if (result.applied > 0) avisar?.()
      return { ok: true, result }
    } catch (error) {
      ultimoError = mensajeDe(error)
      return { ok: false, error: ultimoError }
    } finally {
      enCurso = null
    }
  })()
  return enCurso
}

export async function signIn(url: unknown, password: unknown): Promise<SyncOutcome> {
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/.test(url.trim())) {
    return { ok: false, error: 'la dirección del servidor no vale' }
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'falta la contraseña' }
  }
  const limpia = url.trim()
  try {
    await guardaToken(await loginRemoto(limpia, password, hostname()))
    setMeta('server.url', limpia)
  } catch (error) {
    return { ok: false, error: mensajeDe(error) }
  }
  // `start` ya lanza una sincronización; esta devuelve esa misma promesa.
  await start()
  return syncNow()
}

export function signOut(): void {
  stop()
  setMeta('server.url', '')
  setMeta('server.token', '')
  setMeta('server.tokenEncrypted', '0')
  ultimaVez = null
  ultimoError = null
}

export async function status(): Promise<SyncStatus> {
  return {
    configured: (await readConfig()) !== null,
    url: getMeta('server.url') || null,
    lastAt: ultimaVez,
    lastError: ultimoError,
    running: enCurso !== null,
    tokenEncrypted: getMeta('server.tokenEncrypted') === '1'
  }
}

/** Arranca el ciclo si hay cuenta configurada. Vuelve a llamarse tras entrar. */
export async function start(onApplied?: () => void): Promise<void> {
  if (onApplied) avisar = onApplied
  stop()
  if (!(await readConfig())) return
  temporizador = setInterval(() => void syncNow(), INTERVALO)
  void syncNow()
}

export function stop(): void {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

/** Si el ciclo automático está en marcha. */
export const isRunning = (): boolean => temporizador !== null
