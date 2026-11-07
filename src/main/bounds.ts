/**
 * Geometría de la ventana. Aparte y sin Electron para poder probarla: lo que
 * se guardó la última vez no sirve tal cual si la pantalla donde va a salir es
 * más chica, y es exactamente lo que pasa con un monitor en vertical.
 */

/** Lo que se leyó de `meta`, que puede estar incompleto o ser de otra pantalla. */
export interface SavedBounds {
  x?: number
  y?: number
  width?: number
  height?: number
}

/** El área útil de una pantalla: sin la barra de tareas. */
export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface Geometry {
  width: number
  height: number
  /** Sin posición, Electron centra la ventana, que es lo que queremos la primera vez. */
  x?: number
  y?: number
}

export const DEFAULT_SIZE = { width: 1440, height: 900 }
export const MIN_SIZE = { width: 900, height: 620 }

const entre = (valor: number, minimo: number, maximo: number): number =>
  Math.max(minimo, Math.min(valor, maximo))

/**
 * Encaja la ventana en la pantalla donde va a aparecer.
 *
 * El tamaño nunca pasa del área útil, y nunca baja del mínimo: si la pantalla
 * fuera más chica que el mínimo, gana el mínimo y que asome, porque por debajo
 * de eso la interfaz no funciona. La posición se mete dentro del área, así que
 * una ventana guardada en un monitor que ya no está vuelve a ser visible.
 */
export function fitToScreen(saved: SavedBounds, area: WorkArea): Geometry {
  const width = Math.max(MIN_SIZE.width, Math.min(saved.width ?? DEFAULT_SIZE.width, area.width))
  const height = Math.max(MIN_SIZE.height, Math.min(saved.height ?? DEFAULT_SIZE.height, area.height))

  // Sin posición guardada no inventamos una: centrar es mejor.
  if (typeof saved.x !== 'number' || typeof saved.y !== 'number') return { width, height }

  return {
    width,
    height,
    x: entre(saved.x, area.x, Math.max(area.x, area.x + area.width - width)),
    y: entre(saved.y, area.y, Math.max(area.y, area.y + area.height - height))
  }
}
