/**
 * Módulo Hoy: lo único que hay que mirar al empezar el día.
 *
 * No tiene tablas propias ni escribe nada. Es una consulta derivada sobre lo
 * que ya existe, y por eso terminar algo desde Hoy se hace con los métodos de
 * su módulo (`pendiente.toggle`, `task.update`, `story.update`), no con uno
 * de aquí.
 *
 * "Lo del trabajo" es la tarea no cerrada del sprint abierto con la posición
 * más baja. Si el proyecto se planifica solo con historias y no baja a tareas
 * —que es lo normal al empezar—, entonces es la historia. Como `position` va
 * por proyecto, entre varios proyectos con sprint abierto el empate lo rompe
 * la fecha de creación.
 */
import { getDb } from '../db'
import type { Hoy, Pendiente, TareaEnCurso } from '../../shared/types'

/** Cuántos pendientes de vida caben en un día. */
const CUANTOS = 2

/**
 * Las dos consultas son la misma salvo de qué tabla salen, así que se genera
 * la que corresponda: si divergieran a mano acabarían ordenando distinto.
 */
const enCurso = (kind: 'task' | 'story'): string => {
  const tabla = kind === 'task' ? 'tasks' : 'stories'
  return `
SELECT '${kind}' AS kind, x.id, x.ref, x.title, x.projectId,
       p.name AS projectName,
       p.prefix AS projectPrefix,
       sp.name AS sprintName,
       ${kind === 'task' ? 'st.title' : 'NULL'} AS storyTitle,
       (SELECT cierre.id FROM statuses cierre
         WHERE cierre.projectId = x.projectId AND cierre.kind = '${kind}' AND cierre.isClosed = 1
         ORDER BY cierre.position LIMIT 1) AS closeStatusId
  FROM ${tabla} x
  JOIN projects p ON p.id = x.projectId AND p.archived = 0
  JOIN sprints sp ON sp.id = x.sprintId AND sp.closed = 0
  JOIN statuses abierta ON abierta.id = x.statusId AND abierta.isClosed = 0
  ${kind === 'task' ? 'LEFT JOIN stories st ON st.id = x.storyId' : ''}
 ORDER BY x.position, x.createdAt
 LIMIT 1
`
}

const TAREA = enCurso('task')
const HISTORIA = enCurso('story')

export const api = {
  'hoy.get': (): Hoy => {
    const db = getDb()
    const tarea = db.prepare(TAREA).get() as unknown as TareaEnCurso | undefined
    return {
      pendientes: db.prepare('SELECT * FROM pendientes WHERE done = 0 ORDER BY position LIMIT ?')
        .all(CUANTOS) as unknown as Pendiente[],
      restantes: Math.max(
        0,
        (db.prepare('SELECT count(*) AS n FROM pendientes WHERE done = 0').get() as { n: number }).n - CUANTOS
      ),
      tarea: tarea ?? (db.prepare(HISTORIA).get() as unknown as TareaEnCurso | undefined) ?? null
    }
  }
}
