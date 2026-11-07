/**
 * Test del motor de sincronización. Monta dos bases que hacen de dos equipos
 * y se pasan cambios a mano, sin servidor de por medio:
 *   electron tests/sync.mjs
 *
 * Las marcas de tiempo de los conflictos se ponen a dedo. Con las reales dos
 * cambios del mismo milisegundo empatarían y el test sería una lotería.
 */
import { app } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb } from '../out/main/db.js'
import { api, openOrbit } from '../out/main/registry.js'
import { REPLICATED, pendingChanges, markPushed, readState } from '../out/main/replication.js'
import { applyChanges, asIncoming, ORDER } from '../out/main/sync.js'

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

const VIEJO = '2020-01-01T00:00:00.000Z'
const NUEVO = '2099-01-01T00:00:00.000Z'
const DESPUES = '2099-06-01T00:00:00.000Z'

/** Un cambio de alta/edición listo para aplicar. */
const upsert = (tbl, row, ts, origin = 'otro-equipo') =>
  ({ tbl, rowId: row.id, op: 'upsert', payload: JSON.stringify(row), ts, origin })

const borrado = (tbl, rowId, ts, origin = 'otro-equipo') =>
  ({ tbl, rowId, op: 'delete', payload: null, ts, origin })

app.whenReady().then(() => {
  const dirA = mkdtempSync(join(tmpdir(), 'orbit-sync-a-'))
  const dirB = mkdtempSync(join(tmpdir(), 'orbit-sync-b-'))

  /**
   * La base es un único global del módulo, así que cada equipo se abre, hace
   * lo suyo y se cierra. Todo es sincrónico, no hay carrera posible.
   */
  const on = (dir, fn) => {
    openOrbit(dir)
    try {
      return fn(getDb())
    } finally {
      closeDatabase()
    }
  }

  const stories = (db) => db.prepare('SELECT * FROM stories ORDER BY position').all()

  /* ------------------------------------------- el orden cubre las tablas */
  eq('el orden de aplicación cubre todas las tablas replicadas',
    [...ORDER].sort(), Object.keys(REPLICATED).sort())

  /* -------------------------------------------------- propagación básica */
  const semilla = on(dirA, (db) => {
    const project = api['project.create']({ name: 'Compartido' })
    const story = api['story.create']({ projectId: project.id, title: 'Una historia', points: 3 })
    return {
      projectId: project.id,
      storyId: story.id,
      device: readState(db, 'deviceId'),
      changes: pendingChanges(db, 5000)
    }
  })

  const informe = on(dirB, (db) => applyChanges(db, asIncoming(semilla.changes, semilla.device)))
  check('se aplicaron los cambios del otro equipo', informe.applied === semilla.changes.length,
    `aplicados ${informe.applied} de ${semilla.changes.length}`)
  eq('no se descartó ninguno', informe.skipped, 0)

  on(dirB, (db) => {
    const snap = api['project.snapshot'](semilla.projectId)
    check('el proyecto llegó al otro equipo', !!snap)
    eq('la historia llegó con su título', snap.stories.map((s) => s.title), ['Una historia'])
    eq('la historia llegó con sus puntos', snap.stories[0].points, 3)
    check('los estados llegaron', snap.statuses.length > 0)
    eq('aplicar lo de fuera no genera cambios propios', pendingChanges(db, 100).length, 0)
    // Una misma fila puede venir en varios cambios: al crear la historia se
    // tocó también el proyecto, para subirle el contador de referencias.
    const filasTocadas = new Set(semilla.changes.map((c) => `${c.tbl}\u001f${c.rowId}`)).size
    eq('se guardó la versión de cada fila tocada',
      db.prepare('SELECT count(*) AS n FROM row_version').get().n, filasTocadas)
  })

  /* ------------------------------------------ conflicto: el más nuevo gana */
  on(dirB, (db) => {
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(semilla.storyId)

    const atrasado = applyChanges(db, [upsert('stories', { ...row, title: 'Título viejo' }, VIEJO)])
    eq('un cambio más viejo que el nuestro se descarta', atrasado, { applied: 0, skipped: 1, ignored: 0 })
    eq('el título no se tocó', stories(db)[0].title, 'Una historia')

    const adelantado = applyChanges(db, [upsert('stories', { ...row, title: 'Título nuevo' }, NUEVO)])
    eq('un cambio más nuevo se aplica', adelantado.applied, 1)
    eq('el título es el que llegó', stories(db)[0].title, 'Título nuevo')
  })

  /* -------------------------------------------- empate: desempata el equipo */
  on(dirB, (db) => {
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(semilla.storyId)
    applyChanges(db, [upsert('stories', { ...row, title: 'de aaa' }, DESPUES, 'aaa')])
    eq('con la marca más alta gana quien llegue', stories(db)[0].title, 'de aaa')

    applyChanges(db, [upsert('stories', { ...row, title: 'de bbb' }, DESPUES, 'bbb')])
    eq('al empatar la marca gana el equipo mayor', stories(db)[0].title, 'de bbb')

    applyChanges(db, [upsert('stories', { ...row, title: 'de aaa otra vez' }, DESPUES, 'aaa')])
    eq('al empatar la marca el equipo menor pierde', stories(db)[0].title, 'de bbb')
  })

  /* ------------------------------------------------ idempotencia */
  on(dirB, (db) => {
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(semilla.storyId)
    const lote = [upsert('stories', { ...row, title: 'una vez' }, '2099-07-01T00:00:00.000Z', 'ccc')]
    eq('la primera vez se aplica', applyChanges(db, lote).applied, 1)
    eq('repetir el mismo lote no cambia nada', applyChanges(db, lote), { applied: 0, skipped: 1, ignored: 0 })
    eq('el título sigue siendo el mismo', stories(db)[0].title, 'una vez')
  })

  /* ----------------------------------------- borrado contra edición */
  on(dirB, (db) => {
    applyChanges(db, [borrado('stories', semilla.storyId, '2099-08-01T00:00:00.000Z')])
    eq('el borrado se lleva la fila', stories(db).length, 0)
    eq('el borrado deja lápida',
      db.prepare('SELECT count(*) AS n FROM tombstones WHERE rowId = ?').get(semilla.storyId).n, 1)

    const row = { id: semilla.storyId, projectId: semilla.projectId, ref: 1, epicId: null, sprintId: null,
      statusId: db.prepare('SELECT id FROM statuses WHERE kind = ? LIMIT 1').get('story').id,
      title: 'resucitada', description: '', points: 3, priority: 'normal', blocked: 0, blockedNote: '',
      dueDate: null, tags: '[]', position: 0, createdAt: VIEJO, updatedAt: VIEJO, closedAt: null }

    applyChanges(db, [upsert('stories', row, '2099-07-01T00:00:00.000Z')])
    eq('una edición anterior al borrado no revive la fila', stories(db).length, 0)

    applyChanges(db, [upsert('stories', row, '2099-09-01T00:00:00.000Z')])
    eq('una edición posterior al borrado sí la devuelve', stories(db).map((s) => s.title), ['resucitada'])
  })

  /* ------------------------------------------- reordenar gana o pierde entero */
  const orden = on(dirB, (db) => {
    db.prepare('DELETE FROM stories').run()
    const a = api['story.create']({ projectId: semilla.projectId, title: 'A' })
    const b = api['story.create']({ projectId: semilla.projectId, title: 'B' })
    const c = api['story.create']({ projectId: semilla.projectId, title: 'C' })
    eq('el orden de partida es A B C', stories(db).map((s) => s.title), ['A', 'B', 'C'])
    return { ids: [a.id, b.id, c.id] }
  })

  on(dirB, (db) => {
    const filas = stories(db)
    // El otro equipo las rotó a B C A, y solo una de las tres trae marca nueva.
    // Fila por fila quedaría un orden revuelto; por lotes entran las tres.
    const rotado = [
      upsert('stories', { ...filas[0], position: 2 }, VIEJO),
      upsert('stories', { ...filas[1], position: 0 }, VIEJO),
      upsert('stories', { ...filas[2], position: 1 }, NUEVO)
    ]
    eq('el lote de reorden entra completo', applyChanges(db, rotado).applied, 3)
    eq('el orden es el del otro equipo', stories(db).map((s) => s.title), ['B', 'C', 'A'])
  })

  on(dirB, (db) => {
    const filas = stories(db)
    const viejo = filas.map((fila, i) => upsert('stories', { ...fila, position: 2 - i }, VIEJO))
    eq('un reorden entero más viejo se descarta', applyChanges(db, viejo), { applied: 0, skipped: 3, ignored: 0 })
    eq('el orden no se movió', stories(db).map((s) => s.title), ['B', 'C', 'A'])
  })

  /* ------------------------------------------------------ borrado en cascada */
  const cascada = on(dirA, (db) => {
    api['project.remove'](semilla.projectId)
    return { device: readState(db, 'deviceId'), changes: pendingChanges(db, 5000) }
  })

  on(dirB, (db) => {
    // Este equipo tiene cambios propios de los pasos anteriores; se dan por
    // enviados para poder ver si aplicar el borrado añade alguno.
    const mios = pendingChanges(db, 5000)
    if (mios.length) markPushed(db, mios[mios.length - 1].seq)

    applyChanges(db, asIncoming(cascada.changes, cascada.device))
    eq('el proyecto borrado desaparece', api['project.snapshot'](semilla.projectId), null)
    eq('sus historias se van con él',
      db.prepare('SELECT count(*) AS n FROM stories WHERE projectId = ?').get(semilla.projectId).n, 0)
    eq('aplicar un borrado tampoco genera cambios propios', pendingChanges(db, 100).length, 0)
  })

  /* --------------------------------------------------- tablas desconocidas */
  on(dirB, (db) => {
    eq('un cambio de una tabla que no replicamos se ignora',
      applyChanges(db, [{ tbl: 'tabla_inventada', rowId: 'x', op: 'upsert', payload: '{}', ts: NUEVO, origin: 'z' }]),
      { applied: 0, skipped: 0, ignored: 1 })
  })

  rmSync(dirA, { recursive: true, force: true })
  rmSync(dirB, { recursive: true, force: true })

  console.log(`\n  ${passed} comprobaciones correctas`)
  if (failures.length) {
    console.log(`  ${failures.length} FALLOS:`)
    for (const f of failures) console.log(`    ✗ ${f}`)
  }
  app.exit(failures.length ? 1 : 0)
})
