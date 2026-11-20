/**
 * El módulo de rutina: los hábitos de todos los días.
 *   node tests/rutina.mjs
 *
 * Lo que de verdad hay que demostrar aquí es que el día de ayer queda cerrado:
 * la API sólo escribe sobre hoy, y un día sin marca se queda sin marca. Para
 * poder probarlo sin esperar a mañana, las marcas de días pasados se meten a
 * mano en la tabla, que es exactamente lo que habría dejado la app ese día.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb } from '../out/main/db.js'
import { api, openOrbit } from '../out/main/registry.js'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

const falla = (fn) => {
  try {
    fn()
    return null
  } catch (error) {
    return error.message
  }
}

/** El mismo formato de día local que usa el módulo. */
const dia = (atras = 0) => {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - atras)
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${String(fecha.getDate()).padStart(2, '0')}`
}

/** Deja marcado un día pasado, como lo habría dejado la app ese día. */
const marcarEn = (rutinaId, atras) =>
  getDb().prepare('INSERT INTO rutina_marcas (rutinaId, dia, marcadoAt) VALUES (?, ?, ?)')
    .run(rutinaId, dia(atras), new Date().toISOString())

const dir = mkdtempSync(join(tmpdir(), 'orbit-rutina-'))
openOrbit(dir)

try {
  /* ---------------------------------------------------------------- altas */
  const dientes = api['rutina.create']({ texto: '  Lavarme los dientes  ' })
  eq('el texto llega recortado', dientes.texto, 'Lavarme los dientes')
  eq('nace activo', dientes.activa, 1)
  eq('el primero va en la posición cero', dientes.position, 0)

  const cama = api['rutina.create']({ texto: 'Tender mi cama' })
  eq('el segundo va detrás', cama.position, 1)
  eq('un hábito sin texto no se crea', falla(() => api['rutina.create']({ texto: '   ' })),
    'El hábito necesita un texto')

  /* ------------------------------------------------------- el día de hoy */
  let lista = api['rutina.list']()
  eq('salen los dos', lista.map((r) => r.texto), ['Lavarme los dientes', 'Tender mi cama'])
  eq('ninguno nace hecho', lista.map((r) => r.hecha), [false, false])
  eq('ni con racha', lista.map((r) => r.racha), [0, 0])

  const marcado = api['rutina.toggle'](dientes.id)
  eq('marcar lo deja hecho', marcado.hecha, true)
  eq('y empieza la racha', marcado.racha, 1)
  eq('la marca es de hoy',
    getDb().prepare('SELECT dia FROM rutina_marcas WHERE rutinaId = ?').get(dientes.id).dia, dia(0))

  eq('volver a marcar lo desmarca', api['rutina.toggle'](dientes.id).hecha, false)
  eq('y no deja marca suelta',
    getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE rutinaId = ?').get(dientes.id).n, 0)
  api['rutina.toggle'](dientes.id)

  /* ------------------------------------------------------------- rachas */
  // Ayer, anteayer y el día anterior: tres seguidos antes de hoy.
  for (const atras of [1, 2, 3]) marcarEn(cama.id, atras)
  lista = api['rutina.list']()
  const camaHoy = lista.find((r) => r.id === cama.id)
  eq('hoy sin marcar no rompe la racha: el día no ha acabado', camaHoy.racha, 3)
  eq('pero hoy sigue sin estar hecho', camaHoy.hecha, false)
  eq('y la racha cuenta los días de verdad', api['rutina.toggle'](cama.id).racha, 4)

  // Un hueco en medio sí la corta.
  const leer = api['rutina.create']({ texto: 'Leer' })
  for (const atras of [1, 3, 4]) marcarEn(leer.id, atras)
  eq('un día sin marcar corta la racha en seco',
    api['rutina.list']().find((r) => r.id === leer.id).racha, 1)

  eq('el porcentaje cuenta la ventana entera',
    api['rutina.list']().find((r) => r.id === leer.id).cumplidos, 3)

  /* ------------------------------------- lo de ayer ya no se puede tocar */
  const antes = getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE dia = ?').get(dia(5)).n
  api['rutina.toggle'](leer.id)
  api['rutina.toggle'](leer.id)
  eq('marcar y desmarcar hoy no roza un día pasado',
    getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE dia = ?').get(dia(5)).n, antes)
  eq('los días pasados siguen intactos',
    getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE dia < ?').get(dia(0)).n, 6)

  /* ------------------------------------------------------------- pausar */
  api['rutina.update'](leer.id, { activa: 0 })
  eq('un hábito en pausa no sale en la lista del día',
    api['rutina.list']().map((r) => r.texto), ['Lavarme los dientes', 'Tender mi cama'])
  eq('pero sigue estando si se piden todos',
    api['rutina.list']({ incluirPausados: true }).length, 3)
  eq('renombrar no pierde el historial',
    api['rutina.update'](leer.id, { texto: 'Leer 20 páginas' }).texto, 'Leer 20 páginas')
  eq('y sus marcas siguen ahí',
    getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE rutinaId = ?').get(leer.id).n, 3)

  /* ---------------------------------------------------------- historial */
  const historial = api['rutina.historial']({ dias: 7 })
  eq('el historial trae los días pedidos', historial.length, 7)
  eq('en orden, acabando hoy', historial.at(-1).dia, dia(0))
  eq('y empezando seis días atrás', historial[0].dia, dia(6))
  eq('hoy cuenta los dos marcados', historial.at(-1).hechas, 2)
  check('el total de hoy son los hábitos dados de alta', historial.at(-1).total === 3,
    `total ${historial.at(-1).total}`)

  // Un hábito recién creado no puede salir como fallado antes de existir.
  eq('los días anteriores al alta no cuentan como fallo', historial[0].total, 0)

  /* ------------------------------------------------------------- borrar */
  api['rutina.remove'](cama.id)
  eq('borrar se lleva el hábito', api['rutina.list']().map((r) => r.texto), ['Lavarme los dientes'])
  eq('y su historial se va en cascada',
    getDb().prepare('SELECT count(*) AS n FROM rutina_marcas WHERE rutinaId = ?').get(cama.id).n, 0)

  /* ------------------------------------------- lo que ve la vista de Hoy */
  eq('Hoy trae la rutina', api['hoy.get']().rutinas.map((r) => r.texto), ['Lavarme los dientes'])
} finally {
  closeDatabase()
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n  ${passed} comprobaciones correctas`)
if (failures.length) {
  console.log(`  ${failures.length} FALLOS:`)
  for (const f of failures) console.log(`    ✗ ${f}`)
}
process.exit(failures.length ? 1 : 0)
