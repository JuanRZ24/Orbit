/**
 * Formas que cruzan la frontera: las usan el núcleo, el proceso principal y el
 * renderer. Este fichero no importa nada, para que nadie se enrede en un ciclo.
 */

export interface ServerConfig {
  url: string
  token: string
}

export interface SyncResult {
  /** Cambios nuestros que el servidor aceptó. */
  pushed: number
  /** Cambios nuestros que el servidor descartó por tener algo más nuevo. */
  rejected: number
  applied: number
  skipped: number
  serverSeq: number
  /** Lo que queda por empujar: si no es cero, hay que volver a llamar. */
  pending: number
}

export interface SyncOutcome {
  ok: boolean
  error?: string
  result?: SyncResult
}

export interface SyncStatus {
  configured: boolean
  url: string | null
  lastAt: string | null
  lastError: string | null
  running: boolean
  /** Si el token está en el llavero del sistema o en claro. */
  tokenEncrypted: boolean
}
