/**
 * El módulo de pendientes: la lista de cosas de la vida.
 *   node tests/pendientes.mjs
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

const dir = mkdtempSync(join(tmpdir(), 'orbit-pend-'))
const db = openOrbit(dir)

try {
  /* --------------------------------------------------------------- altas */
  const uno = api['pendiente.create']({ texto: '  Sacar la basura  ' })
  eq('el texto llega recortado', uno.texto, 'Sacar la basura')
  eq('nace sin hacer', uno.done, 0)
  eq('sin fecha de hecho', uno.doneAt, null)
  eq('el primero va en la posición cero', uno.position, 0)

  const dos = api['pendiente.create']({ texto: 'Llamar al dentista' })
  eq('el siguiente va detrás', dos.position, 1)

  eq('un texto vacío no pasa',
    falla(() => api['pendiente.create']({ texto: '' })), 'El pendiente necesita un texto')
  eq('solo espacios tampoco',
    falla(() => api['pendiente.create']({ texto: '   ' })), 'El pendiente necesita un texto')
  eq('y sin texto ninguno',
    falla(() => api['pendiente.create']({})), 'El pendiente necesita un texto')

  const largo = api['pendiente.create']({ texto: 'x'.repeat(900) })
  eq('un texto larguísimo se recorta a 500', largo.texto.length, 500)
  api['pendiente.remove'](largo.id)

  /* --------------------------------------------------------------- listar */
  eq('la lista trae los abiertos en orden',
    api['pendiente.list']().map((p) => p.texto), ['Sacar la basura', 'Llamar al dentista'])

  /* ----------------------------------------------------- marcar hecho */
  const hecho = api['pendiente.toggle'](uno.id)
  eq('marcar lo pone a hecho', hecho.done, 1)
  check('y apunta cuándo', typeof hecho.doneAt === 'string')
  eq('la lista normal ya no lo trae',
    api['pendiente.list']().map((p) => p.texto), ['Llamar al dentista'])
  eq('pidiendo los hechos sí',
    api['pendiente.list']({ includeDone: true }).length, 2)

  const vuelta = api['pendiente.toggle'](uno.id)
  eq('desmarcar lo devuelve a abierto', vuelta.done, 0)
  eq('y limpia la fecha', vuelta.doneAt, null)
  eq('vuelve a la lista', api['pendiente.list']().length, 2)

  eq('marcar algo que no existe no revienta', api['pendiente.toggle']('no-existe'), undefined)

  /* --------------------------------------------------------------- borrar */
  api['pendiente.remove'](dos.id)
  eq('borrar lo quita', api['pendiente.list']().map((p) => p.texto), ['Sacar la basura'])

  /* ------------------------------------------- se replica como lo demás */
  const cambios = db.prepare("SELECT op FROM change_log WHERE tbl = 'pendientes' ORDER BY seq").all()
  check('cada movimiento quedó en el diario', cambios.length >= 6, `hay ${cambios.length}`)
  check('incluido el borrado', cambios.some((c) => c.op === 'delete'))
  const lapidas = db.prepare('SELECT rowId FROM tombstones WHERE tbl = ?').all('pendientes')
    .map((r) => r.rowId).sort()
  eq('y cada borrado dejó la suya', lapidas, [largo.id, dos.id].sort())
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
