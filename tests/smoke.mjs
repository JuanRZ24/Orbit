/**
 * Test de humo de la capa de datos. Se ejecuta con Electron porque usa
 * `node:sqlite` del runtime de Electron:
 *   electron tests/smoke.mjs
 */
import { app } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, closeDatabase } from '../out/main/db.js'
import { api } from '../out/main/api.js'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

app.whenReady().then(() => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-smoke-'))
  openDatabase(dir)

  /* -------------------------------------------------- proyectos y estados */
  const project = api['project.create']({ name: 'Mi App Nueva', description: 'test' })
  eq('prefijo derivado del nombre', project.prefix, 'MAN')
  const snap0 = api['project.snapshot'](project.id)
  eq('5 estados de historia', snap0.statuses.filter((s) => s.kind === 'story').length, 5)
  eq('3 estados de tarea', snap0.statuses.filter((s) => s.kind === 'task').length, 3)
  eq('wiki inicial creada', snap0.wiki.length, 1)

  const storyStatuses = snap0.statuses.filter((s) => s.kind === 'story').sort((a, b) => a.position - b.position)
  const doneStatus = storyStatuses.find((s) => s.isClosed === 1)

  /* --------------------------------------------------- referencias únicas */
  const s1 = api['story.create']({ projectId: project.id, title: 'Primera historia', points: 5 })
  const s2 = api['story.create']({ projectId: project.id, title: 'Segunda historia', points: 3 })
  const issue = api['issue.create']({ projectId: project.id, title: 'Algo falla', type: 'bug' })
  eq('refs correlativas por proyecto', [s1.ref, s2.ref, issue.ref], [1, 2, 3])
  check('tags empiezan como array', Array.isArray(s1.tags) && s1.tags.length === 0)

  /* ------------------------------------------------------ cierre de items */
  eq('closedAt vacío al crear', s1.closedAt, null)
  api['story.update'](s1.id, { statusId: doneStatus.id })
  const afterClose = api['project.snapshot'](project.id).stories.find((s) => s.id === s1.id)
  check('closedAt se rellena al pasar a una columna de cierre', !!afterClose.closedAt)
  api['story.update'](s1.id, { statusId: storyStatuses[0].id })
  const afterReopen = api['project.snapshot'](project.id).stories.find((s) => s.id === s1.id)
  eq('closedAt se limpia al reabrir', afterReopen.closedAt, null)

  /* ------------------------------------------------------------- sprints */
  const sprintId = api['sprint.create']({
    projectId: project.id, name: 'Sprint 1', startDate: '2026-10-20', endDate: '2026-11-02'
  })
  api['story.update'](s1.id, { sprintId })
  const taskA = api['task.create']({ projectId: project.id, title: 'Subtarea A', storyId: s1.id })
  eq('la tarea hereda el sprint de su historia', taskA.sprintId, sprintId)

  api['story.update'](s1.id, { sprintId: null })
  const taskAfter = api['project.snapshot'](project.id).tasks.find((t) => t.id === taskA.id)
  eq('las tareas siguen a la historia al salir del sprint', taskAfter.sprintId, null)

  /* ------------------------------------------------------------ burndown */
  api['story.update'](s1.id, { sprintId })
  api['story.update'](s2.id, { sprintId })
  const chart = api['sprint.burndown'](sprintId)
  eq('la burndown cubre los 14 días del sprint', chart.length, 14)
  eq('la línea ideal arranca en el total de puntos', chart[0].ideal, 8)
  eq('la línea ideal termina en cero', chart[chart.length - 1].ideal, 0)

  /* ------------------------------------------------------------ etiquetas */
  api['story.update'](s2.id, { tags: ['backend', 'urgente'] })
  const snapTags = api['project.snapshot'](project.id)
  eq('las etiquetas usadas se registran en el proyecto', snapTags.tags.map((t) => t.name).sort(), ['backend', 'urgente'])
  eq('las etiquetas vuelven como array', snapTags.stories.find((s) => s.id === s2.id).tags, ['backend', 'urgente'])

  /* ------------------------------------------------------------- reorden */
  api['story.reorder']([s2.id, s1.id])
  eq('reorder fija el orden pedido', api['project.snapshot'](project.id).stories.map((s) => s.id), [s2.id, s1.id])

  /* ------------------------------------------------- borrar un estado */
  const extra = api['status.create']({ projectId: project.id, kind: 'story', name: 'Pausado' })
  api['story.update'](s1.id, { statusId: extra })
  api['status.remove'](extra, storyStatuses[0].id)
  const moved = api['project.snapshot'](project.id).stories.find((s) => s.id === s1.id)
  eq('al borrar una columna sus items pasan a la de respaldo', moved.statusId, storyStatuses[0].id)

  /* -------------------------------------------------------------- buscar */
  const hits = api['search']('historia')
  check('la búsqueda encuentra por título', hits.some((h) => h.id === s2.id))
  eq('la búsqueda ignora consultas de una letra', api['search']('h').length, 0)

  /* -------------------------------------------------------- comentarios */
  api['comment.create']({ projectId: project.id, entityKind: 'story', entityId: s1.id, body: 'una nota' })
  eq('las notas se guardan por entidad', api['comment.list']('story', s1.id).length, 1)

  /* --------------------------------------------------------- resumen */
  const summary = api['project.list']().find((p) => p.project.id === project.id)
  eq('el resumen cuenta las historias', summary.storyCount, 2)
  eq('el resumen suma los puntos', summary.points, 8)
  check('el resumen detecta el sprint abierto', summary.activeSprint?.id === sprintId)

  /* ------------------------------------------------ exportar e importar */
  const dump = api['data.export']()
  api['project.remove'](project.id)
  eq('borrar el proyecto lo quita de la lista', api['project.list']().length, 0)
  eq('borrar el proyecto arrastra sus historias', api['project.snapshot'](project.id), null)
  const imported = api['data.import'](dump, 'replace')
  eq('la importación restaura el proyecto', imported.projects, 1)
  const restored = api['project.snapshot'](project.id)
  eq('se restauran las historias', restored.stories.length, 2)
  eq('se restauran las etiquetas en la historia', restored.stories.find((s) => s.id === s2.id).tags, ['backend', 'urgente'])
  eq('se restauran las notas', api['comment.list']('story', s1.id).length, 1)

  /* --------------------------------------------------------------- demo */
  const demo = api['project.seedDemo']()
  const demoSnap = api['project.snapshot'](demo.id)
  eq('el proyecto de ejemplo trae 7 historias', demoSnap.stories.length, 7)
  eq('el proyecto de ejemplo trae 3 tareas', demoSnap.tasks.length, 3)
  eq('el proyecto de ejemplo trae 2 incidencias', demoSnap.issues.length, 2)
  check('el ejemplo asigna historias al sprint', demoSnap.stories.filter((s) => s.sprintId).length === 4)

  closeDatabase()
  rmSync(dir, { recursive: true, force: true })

  console.log(`\n  ${passed} comprobaciones correctas`)
  if (failures.length) {
    console.log(`  ${failures.length} FALLOS:`)
    for (const f of failures) console.log(`    ✗ ${f}`)
  }
  app.exit(failures.length ? 1 : 0)
})
