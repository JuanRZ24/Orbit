/**
 * Test del diario de cambios. Comprueba que los triggers registran lo que
 * tienen que registrar, que se callan cuando toca y que el mapa de tablas no
 * se ha desfasado del esquema. Se ejecuta con Electron, igual que el de humo:
 *   electron tests/replication.mjs
 */
import { app } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, setMeta } from '../out/main/db.js'
import { api, openOrbit } from '../out/main/registry.js'
import { REPLICATED, pendingChanges, markPushed, setApplying, readState } from '../out/main/replication.js'

// Sin esto una excepción no llamaría a app.exit y el test se colgaría para
// siempre en vez de fallar, que es mucho peor que un fallo.
const revienta = (error) => {
  console.log(`
  EXCEPCIÓN: ${error?.stack ?? error}`)
  app.exit(1)
}
process.on('uncaughtException', revienta)
process.on('unhandledRejection', revienta)

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `esperaba ${JSON.stringify(expected)}, obtuvo ${JSON.stringify(actual)}`)

/** Vacía la bandeja de pendientes y devuelve lo que había. */
function drain() {
  const changes = pendingChanges(getDb(), 5000)
  if (changes.length) markPushed(getDb(), changes[changes.length - 1].seq)
  return changes
}

const of = (changes, tbl) => changes.filter((c) => c.tbl === tbl)

app.whenReady().then(() => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-repl-'))
  openOrbit(dir)
  const db = getDb()

  /* ------------------------------------------- el mapa contra el esquema */
  for (const [table, spec] of Object.entries(REPLICATED)) {
    const real = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name)
    eq(`columnas declaradas de ${table}`, [...spec.columns].sort(), [...real].sort())
    check(`la llave de ${table} son columnas suyas`, spec.key.every((k) => real.includes(k)),
      `llave ${JSON.stringify(spec.key)} contra ${JSON.stringify(real)}`)
  }

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all().map((r) => r.name)
  const noReplicadas = tables.filter((t) => !REPLICATED[t])
  eq('las únicas tablas sin replicar son las locales y las del propio sync',
    noReplicadas.sort(), ['change_log', 'meta', 'row_version', 'sync_state', 'tombstones'])

  eq('hay tres triggers por tabla replicada',
    db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'cl_%'").get().n,
    Object.keys(REPLICATED).length * 3)

  check('se generó un identificador de equipo', !!readState(db, 'deviceId'))
  eq('la bandera arranca apagada', readState(db, 'applying'), '0')

  /* ----------------------------------------------------- altas y cambios */
  const project = api['project.create']({ name: 'Mi App Nueva' })
  const alta = drain()
  eq('el alta del proyecto deja un upsert', of(alta, 'projects').length, 1)
  eq('el upsert lleva la llave de la fila', of(alta, 'projects')[0].rowId, project.id)
  check('el payload trae la fila completa', JSON.parse(of(alta, 'projects')[0].payload).name === 'Mi App Nueva')
  const estados = db.prepare('SELECT count(*) AS n FROM statuses WHERE projectId = ?').get(project.id).n
  eq('se registra un upsert por cada estado sembrado', of(alta, 'statuses').length, estados)
  check('la wiki inicial también se registra', of(alta, 'wiki').length === 1)

  const story = api['story.create']({ projectId: project.id, title: 'Primera historia', points: 5 })
  drain()
  api['story.update'](story.id, { title: 'Historia renombrada' })
  const edicion = drain()
  eq('editar deja un solo upsert', of(edicion, 'stories').length, 1)
  eq('el payload trae el valor nuevo', JSON.parse(of(edicion, 'stories')[0].payload).title, 'Historia renombrada')
  eq('la operación es upsert', of(edicion, 'stories')[0].op, 'upsert')

  /* -------------------------------------------------- llaves compuestas */
  api['story.update'](story.id, { tags: ['backend'] })
  const conTags = drain()
  eq('una etiqueta nueva se registra', of(conTags, 'tags').length, 1)
  eq('la llave compuesta une sus partes', of(conTags, 'tags')[0].rowId, `${project.id}\u001fbackend`)

  /* ------------------------------------------------------- lo que no viaja */
  setMeta('windowBounds', JSON.stringify({ width: 1200 }))
  eq('meta no se replica: es de cada equipo', drain().length, 0)

  /* ------------------------------------------------ la bandera los calla */
  setApplying(db, true)
  api['story.update'](story.id, { title: 'Cambio que llegó del servidor' })
  eq('con la bandera puesta no se registra nada', pendingChanges(db, 100).length, 0)
  setApplying(db, false)
  api['story.update'](story.id, { title: 'Cambio local' })
  eq('al quitar la bandera se vuelve a registrar', of(drain(), 'stories').length, 1)

  /* ------------------------------------------------------------ borrados */
  const issue = api['issue.create']({ projectId: project.id, title: 'Algo falla' })
  drain()
  api['issue.remove'](issue.id)
  const borrado = drain()
  eq('el borrado deja un delete', of(borrado, 'issues').map((c) => c.op), ['delete'])
  eq('el delete no lleva payload', of(borrado, 'issues')[0].payload, null)
  eq('el borrado deja lápida',
    db.prepare('SELECT count(*) AS n FROM tombstones WHERE tbl = ? AND rowId = ?').get('issues', issue.id).n, 1)

  /* ------------------------------------------------- borrado en cascada */
  api['project.remove'](project.id)
  const cascada = drain()
  eq('el proyecto borrado se registra', of(cascada, 'projects').map((c) => c.op), ['delete'])
  eq('la cascada registra también la historia', of(cascada, 'stories').map((c) => c.op), ['delete'])
  eq('la cascada registra también los estados', of(cascada, 'statuses').length, estados)
  check('la cascada registra también la wiki', of(cascada, 'wiki').length === 1)
  eq('quedan lápidas de los hijos',
    db.prepare('SELECT count(*) AS n FROM tombstones WHERE tbl = ?').get('stories').n, 1)

  /* ----------------------------------------------------- la bandeja */
  eq('después de vaciar no quedan pendientes', pendingChanges(db, 100).length, 0)
  api['project.create']({ name: 'Otro' })
  check('lo nuevo vuelve a aparecer como pendiente', pendingChanges(db, 100).length > 0)

  /* --------------------------------- lo que ya estaba antes de los triggers */
  // Una base que se usó antes de que existiera la replicación: si al abrirla
  // no se volcara al diario, sus proyectos no viajarían nunca, y al editar un
  // hijo suyo el servidor reventaría por clave ajena.
  closeDatabase()
  const viejo = mkdtempSync(join(tmpdir(), 'orbit-viejo-'))
  openOrbit(viejo)
  const antiguo = api['project.create']({ name: 'De antes' })
  api['story.create']({ projectId: antiguo.id, title: 'Historia de antes' })

  const sinTriggers = getDb()
  for (const tabla of Object.keys(REPLICATED)) {
    for (const sufijo of ['ai', 'au', 'ad']) sinTriggers.exec(`DROP TRIGGER IF EXISTS cl_${tabla}_${sufijo}`)
  }
  sinTriggers.exec("DELETE FROM change_log; DELETE FROM row_version; DELETE FROM sync_state WHERE key = 'backfilled'")
  closeDatabase()

  openOrbit(viejo)
  const volcado = pendingChanges(getDb(), 5000)
  check('una base anterior a la replicación se vuelca entera', volcado.length > 0)
  eq('con su proyecto', of(volcado, 'projects').length, 1)
  eq('y su historia', of(volcado, 'stories').length, 1)
  check('los padres van antes que los hijos',
    volcado.findIndex((c) => c.tbl === 'projects') < volcado.findIndex((c) => c.tbl === 'stories'))
  eq('el payload viaja completo', JSON.parse(of(volcado, 'projects')[0].payload).name, 'De antes')
  eq('y row_version queda al día',
    getDb().prepare('SELECT count(*) AS n FROM row_version').get().n, volcado.length)
  eq('ninguna fila sin origen',
    getDb().prepare("SELECT count(*) AS n FROM row_version WHERE origin = ''").get().n, 0)

  closeDatabase()
  openOrbit(viejo)
  eq('y abrirla otra vez no lo duplica', pendingChanges(getDb(), 5000).length, volcado.length)

  /* ------------------- una cola a medias, que es el caso que se dio de verdad */
  // Si los triggers llevaban un rato grabando hijos sueltos, esos upserts en
  // cola tienen seq más bajo que el volcado y se irían en un lote anterior al
  // de sus padres. El volcado los repite, así que sobran.
  const aMedias = getDb()
  aMedias.exec("DELETE FROM change_log; DELETE FROM sync_state WHERE key = 'backfilled'")
  aMedias.exec(
    "INSERT INTO change_log (tbl, rowId, op, payload, ts) " +
    "SELECT 'stories', id, 'upsert', json_object('id', id), '2020-01-01T00:00:00.000Z' FROM stories;" +
    "INSERT INTO change_log (tbl, rowId, op, payload, ts) " +
    "VALUES ('stories', 'fantasma', 'delete', NULL, '2020-01-01T00:00:00.000Z')"
  )
  closeDatabase()

  openOrbit(viejo)
  const recuperado = pendingChanges(getDb(), 5000)
  const primeraTabla = recuperado.find((c) => c.op === 'upsert').tbl
  eq('el volcado deja el proyecto por delante de todo', primeraTabla, 'projects')
  eq('y no quedan los upserts huérfanos de antes',
    recuperado.filter((c) => c.op === 'upsert' && c.ts.startsWith('2020')).length, 0)
  eq('pero el borrado en cola se respeta',
    recuperado.filter((c) => c.op === 'delete' && c.rowId === 'fantasma').length, 1)

  closeDatabase()
  rmSync(viejo, { recursive: true, force: true })
  rmSync(dir, { recursive: true, force: true })

  console.log(`\n  ${passed} comprobaciones correctas`)
  if (failures.length) {
    console.log(`  ${failures.length} FALLOS:`)
    for (const f of failures) console.log(`    ✗ ${f}`)
  }
  app.exit(failures.length ? 1 : 0)
})
