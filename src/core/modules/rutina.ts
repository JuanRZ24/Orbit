/**
 * Módulo de rutina: los hábitos de todos los días.
 *
 * La diferencia con pendientes no es cosmética. Un pendiente se hace una vez y
 * se acabó; un hábito vuelve mañana, y lo que interesa no es si está hecho,
 * sino cuántas veces lo has cumplido. Por eso lo marcado vive en su propia
 * tabla, con una fila por hábito y día: así el historial es un hecho guardado
 * y no una cuenta que se pierde al volver a marcar.
 *
 * El día se cierra solo. No hay proceso de medianoche ni nada que se ejecute:
 * `hoy()` cambia de valor y el día de ayer deja de ser marcable, porque la API
 * sólo escribe sobre el día de hoy. Un día sin marca es un día sin marca para
 * siempre, que es justo lo que hace que la gráfica signifique algo.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import type { DiaRutina, Rutina, RutinaHoy } from '../../shared/types'

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS rutinas (
  id TEXT PRIMARY KEY,
  texto TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rutinas_activas ON rutinas(activa, position);

/** Una fila por hábito y día cumplido. Si no hay fila, ese día no se cumplió. */
CREATE TABLE IF NOT EXISTS rutina_marcas (
  rutinaId TEXT NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  marcadoAt TEXT NOT NULL,
  PRIMARY KEY (rutinaId, dia)
);
CREATE INDEX IF NOT EXISTS idx_rutina_marcas_dia ON rutina_marcas(dia);
`

const LARGO = 200

const now = (): string => new Date().toISOString()

/**
 * El día de hoy en la zona de quien usa la app, no en UTC.
 *
 * Marcar a las once de la noche tiene que contar para hoy, y en UTC ya sería
 * mañana. Todo el módulo habla en este formato.
 */
export function hoy(fecha = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** El día `n` días antes de `desde`, en el mismo formato. */
function diaMenos(n: number, desde = new Date()): string {
  const fecha = new Date(desde)
  fecha.setDate(fecha.getDate() - n)
  return hoy(fecha)
}

const get = (id: string): Rutina | undefined =>
  getDb().prepare('SELECT * FROM rutinas WHERE id = ?').get(id) as unknown as Rutina | undefined

const marcasDe = (rutinaId: string): Set<string> =>
  new Set((getDb().prepare('SELECT dia FROM rutina_marcas WHERE rutinaId = ?').all(rutinaId) as unknown as Array<{ dia: string }>)
    .map((m) => m.dia))

/**
 * Días seguidos cumpliendo, contando hacia atrás.
 *
 * El día de hoy sin marcar no rompe la racha: el día no ha terminado todavía,
 * y una racha que se cae cada mañana al levantarte no sirve de nada. Ayer sin
 * marcar sí la rompe.
 */
function racha(marcas: Set<string>, hoyStr: string): number {
  let dias = 0
  let desplazamiento = marcas.has(hoyStr) ? 0 : 1
  for (;;) {
    const dia = diaMenos(desplazamiento)
    if (!marcas.has(dia)) return dias
    dias++
    desplazamiento++
  }
}

/** Cuántas de las últimas `ventana` marcas cayeron, hoy incluido. */
function cumplidos(marcas: Set<string>, ventana: number): number {
  let n = 0
  for (let atras = 0; atras < ventana; atras++) if (marcas.has(diaMenos(atras))) n++
  return n
}

/** La ventana de la gráfica y del porcentaje. */
export const VENTANA = 30

export const api = {
  'rutina.create': (input: { texto?: unknown }): Rutina => {
    const texto = typeof input?.texto === 'string' ? input.texto.trim() : ''
    if (texto.length === 0) throw new Error('El hábito necesita un texto')

    const db = getDb()
    const hueco = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM rutinas').get() as { p: number }
    const id = randomUUID()
    const stamp = now()
    db.prepare('INSERT INTO rutinas (id, texto, activa, position, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?, ?)')
      .run(id, texto.slice(0, LARGO), hueco.p + 1, stamp, stamp)
    return get(id) as Rutina
  },

  /** Los hábitos activos con lo de hoy ya resuelto: la vista no calcula nada. */
  'rutina.list': (options?: { incluirPausados?: boolean }): RutinaHoy[] => {
    const hoyStr = hoy()
    const rutinas = getDb().prepare(
      options?.incluirPausados
        ? 'SELECT * FROM rutinas ORDER BY activa DESC, position'
        : 'SELECT * FROM rutinas WHERE activa = 1 ORDER BY position'
    ).all() as unknown as Rutina[]

    return rutinas.map((rutina) => {
      const marcas = marcasDe(rutina.id)
      return {
        ...rutina,
        hecha: marcas.has(hoyStr),
        racha: racha(marcas, hoyStr),
        cumplidos: cumplidos(marcas, VENTANA),
        ventana: VENTANA
      }
    })
  },

  /**
   * Marca el hábito como cumplido hoy, o quita la marca de hoy.
   *
   * Sólo toca el día de hoy, a propósito: así es como el día anterior queda
   * bloqueado sin que nada tenga que cerrarlo.
   */
  'rutina.toggle': (id: string): RutinaHoy | undefined => {
    const rutina = get(id)
    if (!rutina) return undefined

    const db = getDb()
    const hoyStr = hoy()
    const puesta = db.prepare('SELECT 1 AS hay FROM rutina_marcas WHERE rutinaId = ? AND dia = ?')
      .get(id, hoyStr) as { hay: number } | undefined

    if (puesta) db.prepare('DELETE FROM rutina_marcas WHERE rutinaId = ? AND dia = ?').run(id, hoyStr)
    else db.prepare('INSERT INTO rutina_marcas (rutinaId, dia, marcadoAt) VALUES (?, ?, ?)').run(id, hoyStr, now())

    const marcas = marcasDe(id)
    return {
      ...rutina,
      hecha: marcas.has(hoyStr),
      racha: racha(marcas, hoyStr),
      cumplidos: cumplidos(marcas, VENTANA),
      ventana: VENTANA
    }
  },

  'rutina.update': (id: string, cambios: { texto?: string; activa?: number; position?: number }): Rutina | undefined => {
    const actual = get(id)
    if (!actual) return undefined

    const texto = typeof cambios.texto === 'string' ? cambios.texto.trim().slice(0, LARGO) : actual.texto
    if (texto.length === 0) throw new Error('El hábito necesita un texto')

    getDb().prepare('UPDATE rutinas SET texto = ?, activa = ?, position = ?, updatedAt = ? WHERE id = ?')
      .run(texto, cambios.activa ?? actual.activa, cambios.position ?? actual.position, now(), id)
    return get(id)
  },

  /** Borra el hábito y, con él, su historial: las marcas van en cascada. */
  'rutina.remove': (id: string): void => {
    getDb().prepare('DELETE FROM rutinas WHERE id = ?').run(id)
  },

  /**
   * Cuántos hábitos tocaban y cuántos se cumplieron cada día.
   *
   * El «tocaban» se saca de qué hábitos ya existían ese día, porque uno que
   * diste de alta el martes no puede contar como fallado el lunes. Los
   * pausados sí cuentan hacia atrás: el día que los cumpliste, los cumpliste.
   */
  'rutina.historial': (options?: { dias?: number }): DiaRutina[] => {
    const ventana = Math.min(Math.max(options?.dias ?? VENTANA, 1), 365)
    const db = getDb()

    const altas = (db.prepare('SELECT createdAt FROM rutinas').all() as unknown as Array<{ createdAt: string }>)
      .map((r) => hoy(new Date(r.createdAt)))

    const porDia = new Map<string, number>()
    for (const marca of db.prepare('SELECT dia, count(*) AS n FROM rutina_marcas GROUP BY dia')
      .all() as unknown as Array<{ dia: string; n: number }>) porDia.set(marca.dia, marca.n)

    const historial: DiaRutina[] = []
    for (let atras = ventana - 1; atras >= 0; atras--) {
      const dia = diaMenos(atras)
      historial.push({
        dia,
        hechas: porDia.get(dia) ?? 0,
        total: altas.filter((alta) => alta <= dia).length
      })
    }
    return historial
  }
}
