/**
 * La vista Hoy, por el lado de los datos: dos pendientes de vida y la tarea en
 * curso, y que al terminar una aparezca la siguiente.
 *   node tests/hoy.mjs
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

const dir = mkdtempSync(join(tmpdir(), 'orbit-hoy-'))
const db = openOrbit(dir)

const hoy = () => api['hoy.get']()
const textos = () => hoy().pendientes.map((p) => p.texto)

try {
  /* ---------------------------------------------------------- vacío */
  eq('sin nada, Hoy no trae pendientes', hoy().pendientes, [])
  eq('ni cola esperando', hoy().restantes, 0)
  eq('ni tarea', hoy().tarea, null)

  /* ------------------------------------------------ dos, no más */
  const uno = api['pendiente.create']({ texto: 'Uno' })
  api['pendiente.create']({ texto: 'Dos' })
  api['pendiente.create']({ texto: 'Tres' })
  eq('solo caben dos en un día', textos(), ['Uno', 'Dos'])
  eq('y avisa de los que esperan', hoy().restantes, 1)

  api['pendiente.toggle'](uno.id)
  eq('al terminar uno aparece el siguiente', textos(), ['Dos', 'Tres'])
  eq('y la cola se vacía', hoy().restantes, 0)

  api['pendiente.toggle'](uno.id)
  eq('y si lo desmarco vuelve a su sitio', textos(), ['Uno', 'Dos'])

  /* ------------------------------------------------- la tarea en curso */
  const project = api['project.create']({ name: 'Trabajo Serio' })
  const sprintId = api['sprint.create']({
    projectId: project.id, name: 'Sprint 1', startDate: '2026-11-01', endDate: '2026-11-14'
  })
  const story = api['story.create']({ projectId: project.id, title: 'Una historia' })

  const suelta = api['task.create']({ projectId: project.id, title: 'Tarea sin sprint' })
  eq('una tarea fuera de sprint no sale en Hoy', hoy().tarea, null)

  api['story.update'](story.id, { sprintId })
  const t1 = api['task.create']({ projectId: project.id, title: 'Tarea uno', storyId: story.id })
  const t2 = api['task.create']({ projectId: project.id, title: 'Tarea dos', storyId: story.id })

  const enCurso = hoy().tarea
  eq('sale la primera tarea del sprint abierto', enCurso.title, 'Tarea uno')
  eq('con su proyecto', enCurso.projectName, 'Trabajo Serio')
  eq('con su sprint', enCurso.sprintName, 'Sprint 1')
  eq('y la historia a la que cuelga', enCurso.storyTitle, 'Una historia')
  check('trae referencia', typeof enCurso.ref === 'number')

  const cierre = db.prepare(
    "SELECT id FROM statuses WHERE projectId = ? AND kind = 'task' AND isClosed = 1 ORDER BY position LIMIT 1"
  ).get(project.id).id
  eq('trae la columna de cierre del proyecto', enCurso.closeStatusId, cierre)

  /* ------------------------------------------ terminarla trae la siguiente */
  api['task.update'](t1.id, { statusId: enCurso.closeStatusId })
  eq('al terminarla aparece la siguiente', hoy().tarea.title, 'Tarea dos')

  api['task.update'](t2.id, { statusId: cierre })
  eq('sin tareas abiertas no hay nada en curso', hoy().tarea, null)

  /* ------------------------------------------------ lo que no debe salir */
  const abierta = db.prepare(
    "SELECT id FROM statuses WHERE projectId = ? AND kind = 'task' AND isClosed = 0 ORDER BY position LIMIT 1"
  ).get(project.id).id
  api['task.update'](t1.id, { statusId: abierta })
  eq('reabrirla la devuelve a Hoy', hoy().tarea.title, 'Tarea uno')

  api['sprint.update'](sprintId, { closed: 1 })
  eq('con el sprint cerrado no hay tarea en curso', hoy().tarea, null)

  api['sprint.update'](sprintId, { closed: 0 })
  api['project.update'](project.id, { archived: 1 })
  eq('un proyecto archivado no asoma por Hoy', hoy().tarea, null)

  api['project.update'](project.id, { archived: 0 })
  eq('y al restaurarlo vuelve', hoy().tarea.title, 'Tarea uno')

  /* ------------------------------------------- Hoy no escribe nada */
  const antes = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM change_log').get().s
  hoy()
  eq('consultar Hoy no genera ningún cambio',
    db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM change_log').get().s, antes)

  api['task.remove'](suelta.id)
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
