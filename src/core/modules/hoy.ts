/**
 * Módulo Hoy: lo único que hay que mirar al empezar el día.
 *
 * No tiene tablas propias ni escribe nada. Es una consulta derivada sobre lo
 * que ya existe, y por eso terminar algo desde Hoy se hace con los métodos de
 * su módulo (`pendiente.toggle`, `task.update`), no con uno de aquí.
 *
 * "La tarea en curso" es la tarea no cerrada del sprint abierto con la
 * posición más baja. Como `position` va por proyecto, entre varios proyectos
 * con sprint abierto el empate lo rompe la fecha de creación.
 */
import { getDb } from '../db'
import type { Hoy, Pendiente, TareaEnCurso } from '../../shared/types'

/** Cuántos pendientes de vida caben en un día. */
const CUANTOS = 2

const TAREA = `
SELECT t.id, t.ref, t.title, t.projectId,
       p.name AS projectName,
       p.prefix AS projectPrefix,
       sp.name AS sprintName,
       st.title AS storyTitle,
       (SELECT cierre.id FROM statuses cierre
         WHERE cierre.projectId = t.projectId AND cierre.kind = 'task' AND cierre.isClosed = 1
         ORDER BY cierre.position LIMIT 1) AS closeStatusId
  FROM tasks t
  JOIN projects p ON p.id = t.projectId AND p.archived = 0
  JOIN sprints sp ON sp.id = t.sprintId AND sp.closed = 0
  JOIN statuses abierta ON abierta.id = t.statusId AND abierta.isClosed = 0
  LEFT JOIN stories st ON st.id = t.storyId
 ORDER BY t.position, t.createdAt
 LIMIT 1
`

export const api = {
  'hoy.get': (): Hoy => {
    const db = getDb()
    return {
      pendientes: db.prepare('SELECT * FROM pendientes WHERE done = 0 ORDER BY position LIMIT ?')
        .all(CUANTOS) as unknown as Pendiente[],
      restantes: Math.max(
        0,
        (db.prepare('SELECT count(*) AS n FROM pendientes WHERE done = 0').get() as { n: number }).n - CUANTOS
      ),
      tarea: (db.prepare(TAREA).get() as unknown as TareaEnCurso | undefined) ?? null
    }
  }
}
