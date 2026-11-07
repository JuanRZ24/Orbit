/**
 * La geometría de la ventana contra pantallas reales, la vertical incluida.
 *   node tests/bounds.mjs
 */
import { DEFAULT_SIZE, MIN_SIZE, fitToScreen } from '../out/main/bounds.js'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

/**
 * Las dos pantallas de esta máquina, con su barra de tareas descontada. El
 * vertical está a la izquierda y más arriba, o sea en coordenadas negativas:
 * no es un caso raro, es la colocación normal de un segundo monitor.
 */
const HORIZONTAL = { x: 0, y: 0, width: 1920, height: 1032 }
const VERTICAL = { x: -1080, y: -383, width: 1080, height: 1872 }

/* ------------------------------------------------------- primera vez */
eq('sin nada guardado usa el tamaño por defecto',
  fitToScreen({}, HORIZONTAL), { width: 1440, height: 900 })
check('y no fija posición, para que Electron la centre',
  fitToScreen({}, HORIZONTAL).x === undefined)

/* ---------------------------------------- el monitor vertical, que es el caso */
const enVertical = fitToScreen({}, VERTICAL)
eq('en el vertical el ancho se recorta a la pantalla', enVertical.width, 1080)
check('y no se sale', enVertical.width <= VERTICAL.width,
  `${enVertical.width} > ${VERTICAL.width}`)
eq('la altura por defecto cabe de sobra', enVertical.height, DEFAULT_SIZE.height)

const grandeEnVertical = fitToScreen({ x: -1080, y: -383, width: 1600, height: 2400 }, VERTICAL)
eq('una ventana guardada más grande que el vertical se encaja entera',
  { w: grandeEnVertical.width, h: grandeEnVertical.height }, { w: 1080, h: 1872 })

// La ventana por defecto de Orbit, 1440x900, no cabe de ancho en el vertical.
const defectoEnVertical = fitToScreen({ x: -1080, y: -383, width: 1440, height: 900 }, VERTICAL)
eq('la ventana por defecto se recorta al ancho del vertical', defectoEnVertical.width, 1080)
eq('y se queda donde estaba, aunque sea en negativo',
  { x: defectoEnVertical.x, y: defectoEnVertical.y }, { x: -1080, y: -383 })

/* --------------------------------------------- la posición vuelve a la vista */
const fuera = fitToScreen({ x: 5000, y: 4000, width: 1000, height: 800 }, HORIZONTAL)
eq('una ventana de un monitor que ya no está vuelve dentro',
  { x: fuera.x, y: fuera.y }, { x: 1920 - 1000, y: 1032 - 800 })

const negativa = fitToScreen({ x: -800, y: -600, width: 1000, height: 800 }, HORIZONTAL)
eq('y si estaba en negativo también', { x: negativa.x, y: negativa.y }, { x: 0, y: 0 })

const dentro = fitToScreen({ x: -1000, y: -300, width: 1000, height: 900 }, VERTICAL)
eq('una posición que ya cabía no se toca', { x: dentro.x, y: dentro.y }, { x: -1000, y: -300 })

/* ------------------------------------------------------- el mínimo manda */
const diminuta = fitToScreen({ width: 300, height: 200 }, HORIZONTAL)
eq('nunca baja del mínimo', { w: diminuta.width, h: diminuta.height },
  { w: MIN_SIZE.width, h: MIN_SIZE.height })

const pantallaChica = fitToScreen({}, { x: 0, y: 0, width: 800, height: 600 })
eq('en una pantalla por debajo del mínimo gana el mínimo y que asome',
  { w: pantallaChica.width, h: pantallaChica.height },
  { w: MIN_SIZE.width, h: MIN_SIZE.height })
check('y la posición no se va a negativo por eso',
  fitToScreen({ x: 10, y: 10, width: 300, height: 200 }, { x: 0, y: 0, width: 800, height: 600 }).x === 0)

/* ---------------------------------------------- datos a medias o corruptos */
eq('con solo el ancho guardado, la altura usa el defecto',
  fitToScreen({ width: 1000 }, HORIZONTAL).height, DEFAULT_SIZE.height)
check('con posición a medias no fija posición',
  fitToScreen({ x: 10, width: 1000, height: 800 }, HORIZONTAL).x === undefined)

console.log(`\n  ${passed} comprobaciones correctas`)
if (failures.length) {
  console.log(`  ${failures.length} FALLOS:`)
  for (const f of failures) console.log(`    ✗ ${f}`)
}
process.exit(failures.length ? 1 : 0)
