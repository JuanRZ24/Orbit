/**
 * El mapa de métodos de todos los módulos junto, que es lo único que ven el
 * proceso principal y el servidor.
 *
 * El namespace del método es la frontera del módulo: `project.*`, `story.*` y
 * `sprint.*` son de Orbit, `pendiente.*` de pendientes y `hoy.*` de Hoy. Añadir un módulo es
 * importarlo aquí y sumar su esquema; nadie más se entera.
 */
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../db'
import { api as orbit } from './orbit'
import { api as pendientes, SCHEMA as esquemaPendientes } from './pendientes'
import { api as hoy } from './hoy'

/** Lo que cada módulo añade al esquema base. */
export const MODULE_SCHEMAS = [esquemaPendientes]

/** Abre la base con todos los módulos montados. Es el arranque de todos. */
export const openOrbit = (userDataDir: string): DatabaseSync =>
  openDatabase(userDataDir, MODULE_SCHEMAS)

// El tipo va anotado a mano: si se deja inferir, TypeScript tiene que nombrar
// los tipos internos de cada módulo y no puede.
export const api: typeof orbit & typeof pendientes & typeof hoy = {
  ...orbit,
  ...pendientes,
  ...hoy
}

export type Api = typeof api
export type ApiMethod = keyof Api
