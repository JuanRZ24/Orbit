import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import type {
  Activity, BurndownPoint, Comment, Epic, ID, Issue, ItemKind, Project, ProjectSnapshot,
  ProjectSummary, Sprint, Status, Story, Tag, Task, WikiPage
} from '../shared/types'

/* ------------------------------------------------------------------ utils */

const uid = (): string => randomUUID()
const now = (): string => new Date().toISOString()
const today = (): string => new Date().toISOString().slice(0, 10)

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sin-titulo'
}

function derivePrefix(name: string): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (words.length === 0) return 'PRJ'
  const raw = words.length > 1 ? words.map((w) => w[0]).join('') : words[0].slice(0, 3)
  return raw.toUpperCase().slice(0, 4)
}

const jsonTags = (value: unknown): string[] => {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

type Row = Record<string, unknown>
const withTags = <T>(row: Row): T => ({ ...row, tags: jsonTags(row.tags) }) as T

function nextRef(projectId: ID): number {
  const db = getDb()
  db.prepare('UPDATE projects SET refCounter = refCounter + 1 WHERE id = ?').run(projectId)
  const row = db.prepare('SELECT refCounter FROM projects WHERE id = ?').get(projectId) as { refCounter: number }
  return row.refCounter
}

function nextPosition(table: string, where: string, params: unknown[]): number {
  const row = getDb().prepare(`SELECT COALESCE(MAX(position), -1) AS p FROM ${table} WHERE ${where}`).get(...(params as never[])) as { p: number }
  return row.p + 1
}

/** Columnas permitidas por tabla: evita que un patch escriba campos arbitrarios. */
const WRITABLE: Record<string, string[]> = {
  projects: ['name', 'slug', 'prefix', 'description', 'color', 'archived', 'position'],
  statuses: ['name', 'color', 'isClosed', 'wipLimit', 'position'],
  epics: ['title', 'description', 'color', 'closed', 'position'],
  sprints: ['name', 'goal', 'startDate', 'endDate', 'closed', 'position'],
  stories: ['epicId', 'sprintId', 'statusId', 'title', 'description', 'points', 'priority', 'blocked', 'blockedNote', 'dueDate', 'tags', 'position', 'closedAt'],
  tasks: ['storyId', 'sprintId', 'statusId', 'title', 'description', 'priority', 'blocked', 'dueDate', 'tags', 'position', 'closedAt'],
  issues: ['sprintId', 'statusId', 'title', 'description', 'type', 'severity', 'priority', 'blocked', 'dueDate', 'tags', 'position', 'closedAt'],
  wiki: ['slug', 'title', 'content', 'position']
}

function patchRow(table: string, id: ID, patch: Row, touch = true): void {
  const allowed = WRITABLE[table] ?? []
  const keys = Object.keys(patch).filter((k) => allowed.includes(k))
  if (keys.length === 0) return
  const sets = keys.map((k) => `${k} = ?`)
  const values = keys.map((k) => {
    const v = patch[k]
    if (k === 'tags') return JSON.stringify(Array.isArray(v) ? v : [])
    if (typeof v === 'boolean') return v ? 1 : 0
    return v === undefined ? null : (v as never)
  })
  if (touch && table !== 'statuses') {
    sets.push('updatedAt = ?')
    values.push(now() as never)
  }
  getDb().prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]), id)
}

function logActivity(entry: Omit<Activity, 'id' | 'createdAt'>): void {
  getDb().prepare(
    `INSERT INTO activity (id, projectId, entityKind, entityId, entityRef, entityTitle, action, detail, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uid(), entry.projectId, entry.entityKind, entry.entityId, entry.entityRef, entry.entityTitle, entry.action, entry.detail, now())
  // Mantener el registro acotado: sólo las últimas 500 entradas por proyecto.
  getDb().prepare(
    `DELETE FROM activity WHERE projectId = ? AND id NOT IN (
       SELECT id FROM activity WHERE projectId = ? ORDER BY createdAt DESC LIMIT 500)`
  ).run(entry.projectId, entry.projectId)
}

function isClosedStatus(statusId: ID | null | undefined): boolean {
  if (!statusId) return false
  const row = getDb().prepare('SELECT isClosed FROM statuses WHERE id = ?').get(statusId) as { isClosed: number } | undefined
  return !!row && row.isClosed === 1
}

/** Garantiza que cada etiqueta usada exista en la tabla de tags del proyecto. */
function ensureTags(projectId: ID, tags: string[] | undefined): void {
  if (!tags?.length) return
  const stmt = getDb().prepare('INSERT INTO tags (projectId, name, color) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
  const palette = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6']
  for (const name of tags) {
    const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    stmt.run(projectId, name, palette[hash % palette.length])
  }
}

/* -------------------------------------------------------- estados por defecto */

const DEFAULT_STATUSES: Record<ItemKind, Array<[string, string, 0 | 1]>> = {
  story: [
    ['Nuevo', '#94a3b8', 0],
    ['Listo', '#38bdf8', 0],
    ['En progreso', '#f59e0b', 0],
    ['En revisión', '#a855f7', 0],
    ['Hecho', '#22c55e', 1]
  ],
  task: [
    ['Pendiente', '#94a3b8', 0],
    ['En progreso', '#f59e0b', 0],
    ['Hecho', '#22c55e', 1]
  ],
  issue: [
    ['Nuevo', '#94a3b8', 0],
    ['Confirmado', '#38bdf8', 0],
    ['En progreso', '#f59e0b', 0],
    ['Resuelto', '#22c55e', 1],
    ['Descartado', '#64748b', 1]
  ]
}

function createDefaultStatuses(projectId: ID): void {
  const stmt = getDb().prepare(
    'INSERT INTO statuses (id, projectId, kind, name, color, isClosed, wipLimit, position) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  )
  for (const kind of Object.keys(DEFAULT_STATUSES) as ItemKind[]) {
    DEFAULT_STATUSES[kind].forEach(([name, color, closed], i) => {
      stmt.run(uid(), projectId, kind, name, color, closed, i)
    })
  }
}

function firstStatus(projectId: ID, kind: ItemKind): ID {
  const row = getDb().prepare('SELECT id FROM statuses WHERE projectId = ? AND kind = ? ORDER BY position LIMIT 1')
    .get(projectId, kind) as { id: string } | undefined
  if (!row) throw new Error(`El proyecto no tiene estados de tipo ${kind}`)
  return row.id
}

/* ------------------------------------------------------------- burndown */

function recordSprintHistory(sprintId: ID | null): void {
  if (!sprintId) return
  const db = getDb()
  const agg = db.prepare(
    `SELECT COALESCE(SUM(s.points), 0) AS total,
            COALESCE(SUM(CASE WHEN st.isClosed = 0 THEN s.points ELSE 0 END), 0) AS remaining
     FROM stories s JOIN statuses st ON st.id = s.statusId
     WHERE s.sprintId = ?`
  ).get(sprintId) as { total: number; remaining: number }
  db.prepare(
    `INSERT INTO sprint_history (sprintId, date, remainingPoints, totalPoints) VALUES (?, ?, ?, ?)
     ON CONFLICT(sprintId, date) DO UPDATE SET remainingPoints = excluded.remainingPoints, totalPoints = excluded.totalPoints`
  ).run(sprintId, today(), agg.remaining, agg.total)
}

function burndown(sprintId: ID): BurndownPoint[] {
  const db = getDb()
  const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprintId) as Sprint | undefined
  if (!sprint) return []
  const agg = db.prepare(
    `SELECT COALESCE(SUM(s.points), 0) AS total,
            COALESCE(SUM(CASE WHEN st.isClosed = 0 THEN s.points ELSE 0 END), 0) AS remaining
     FROM stories s JOIN statuses st ON st.id = s.statusId WHERE s.sprintId = ?`
  ).get(sprintId) as { total: number; remaining: number }

  const start = sprint.startDate?.slice(0, 10) ?? today()
  const end = sprint.endDate?.slice(0, 10) ?? today()
  const history = db.prepare('SELECT date, remainingPoints FROM sprint_history WHERE sprintId = ? ORDER BY date')
    .all(sprintId) as Array<{ date: string; remainingPoints: number }>

  const days: string[] = []
  for (let d = new Date(start + 'T00:00:00'); d.toISOString().slice(0, 10) <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
    if (days.length > 400) break
  }
  if (days.length === 0) days.push(start)

  const total = agg.total
  const span = Math.max(days.length - 1, 1)
  let last = total
  return days.map((date, i) => {
    const point = history.filter((h) => h.date <= date).pop()
    if (point) last = point.remainingPoints
    const isFuture = date > today()
    return {
      date,
      remaining: isFuture ? NaN : (date === today() ? agg.remaining : last),
      ideal: Math.round((total - (total * i) / span) * 100) / 100
    }
  })
}

/* ------------------------------------------------------------- proyectos */

function listProjects(): ProjectSummary[] {
  const db = getDb()
  const projects = db.prepare('SELECT * FROM projects ORDER BY archived, position, createdAt').all() as unknown as Project[]
  return projects.map((project) => {
    const s = db.prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN st.isClosed = 1 THEN 1 ELSE 0 END), 0) AS closed,
              COALESCE(SUM(s.points), 0) AS pts,
              COALESCE(SUM(CASE WHEN st.isClosed = 1 THEN s.points ELSE 0 END), 0) AS ptsClosed
       FROM stories s JOIN statuses st ON st.id = s.statusId WHERE s.projectId = ?`
    ).get(project.id) as { n: number; closed: number; pts: number; ptsClosed: number }
    const openIssues = db.prepare(
      `SELECT COUNT(*) AS n FROM issues i JOIN statuses st ON st.id = i.statusId WHERE i.projectId = ? AND st.isClosed = 0`
    ).get(project.id) as { n: number }
    const openTasks = db.prepare(
      `SELECT COUNT(*) AS n FROM tasks t JOIN statuses st ON st.id = t.statusId WHERE t.projectId = ? AND st.isClosed = 0`
    ).get(project.id) as { n: number }
    const sprint = db.prepare('SELECT * FROM sprints WHERE projectId = ? AND closed = 0 ORDER BY position DESC LIMIT 1')
      .get(project.id) as unknown as Sprint | undefined
    return {
      project,
      storyCount: s.n, storyClosed: s.closed, points: s.pts, pointsClosed: s.ptsClosed,
      issueOpen: openIssues.n, taskOpen: openTasks.n, activeSprint: sprint ?? null
    }
  })
}

function createProject(input: { name: string; prefix?: string; description?: string; color?: string }): Project {
  const db = getDb()
  const id = uid()
  const stamp = now()
  const prefix = (input.prefix?.trim() || derivePrefix(input.name)).toUpperCase().slice(0, 5)
  db.prepare(
    `INSERT INTO projects (id, name, slug, prefix, description, color, archived, refCounter, position, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
  ).run(id, input.name.trim(), slugify(input.name), prefix, input.description ?? '', input.color ?? '#6366f1',
    nextPosition('projects', '1=1', []), stamp, stamp)
  createDefaultStatuses(id)
  db.prepare('INSERT INTO wiki (id, projectId, slug, title, content, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .run(uid(), id, 'inicio', 'Inicio', `# ${input.name}\n\nNotas y documentación del proyecto.\n`, stamp, stamp)
  logActivity({ projectId: id, entityKind: 'project', entityId: id, entityRef: null, entityTitle: input.name, action: 'created', detail: 'Proyecto creado' })
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as Project
}

function snapshot(projectId: ID): ProjectSnapshot | null {
  const db = getDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown as Project | undefined
  if (!project) return null
  return {
    project,
    statuses: db.prepare('SELECT * FROM statuses WHERE projectId = ? ORDER BY kind, position').all(projectId) as unknown as Status[],
    epics: db.prepare('SELECT * FROM epics WHERE projectId = ? ORDER BY position').all(projectId) as unknown as Epic[],
    sprints: db.prepare('SELECT * FROM sprints WHERE projectId = ? ORDER BY position').all(projectId) as unknown as Sprint[],
    stories: (db.prepare('SELECT * FROM stories WHERE projectId = ? ORDER BY position').all(projectId) as Row[]).map((r) => withTags<Story>(r)),
    tasks: (db.prepare('SELECT * FROM tasks WHERE projectId = ? ORDER BY position').all(projectId) as Row[]).map((r) => withTags<Task>(r)),
    issues: (db.prepare('SELECT * FROM issues WHERE projectId = ? ORDER BY position').all(projectId) as Row[]).map((r) => withTags<Issue>(r)),
    wiki: db.prepare('SELECT * FROM wiki WHERE projectId = ? ORDER BY position').all(projectId) as unknown as WikiPage[],
    tags: db.prepare('SELECT * FROM tags WHERE projectId = ? ORDER BY name').all(projectId) as unknown as Tag[],
    activity: db.prepare('SELECT * FROM activity WHERE projectId = ? ORDER BY createdAt DESC LIMIT 60').all(projectId) as unknown as Activity[]
  }
}

/* ------------------------------------------------------- items genéricos */

function reorder(table: string, ids: ID[]): void {
  const stmt = getDb().prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
  ids.forEach((id, i) => stmt.run(i, id))
}

interface ItemInput {
  projectId: ID
  title: string
  description?: string
  statusId?: ID
  sprintId?: ID | null
  epicId?: ID | null
  storyId?: ID | null
  points?: number | null
  priority?: string
  type?: string
  severity?: string
  tags?: string[]
  dueDate?: string | null
  atTop?: boolean
}

function positionFor(table: string, scope: string, params: unknown[], atTop?: boolean): number {
  if (!atTop) return nextPosition(table, scope, params)
  const row = getDb().prepare(`SELECT COALESCE(MIN(position), 0) AS p FROM ${table} WHERE ${scope}`).get(...(params as never[])) as { p: number }
  return row.p - 1
}

function createStory(input: ItemInput): Story {
  const db = getDb()
  const id = uid()
  const stamp = now()
  const statusId = input.statusId ?? firstStatus(input.projectId, 'story')
  const ref = nextRef(input.projectId)
  ensureTags(input.projectId, input.tags)
  db.prepare(
    `INSERT INTO stories (id, projectId, ref, epicId, sprintId, statusId, title, description, points, priority,
       blocked, blockedNote, dueDate, tags, position, createdAt, updatedAt, closedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?, ?, ?, ?)`
  ).run(id, input.projectId, ref, input.epicId ?? null, input.sprintId ?? null, statusId, input.title.trim(),
    input.description ?? '', input.points ?? null, input.priority ?? 'normal', input.dueDate ?? null,
    JSON.stringify(input.tags ?? []), positionFor('stories', 'projectId = ?', [input.projectId], input.atTop),
    stamp, stamp, isClosedStatus(statusId) ? stamp : null)
  logActivity({ projectId: input.projectId, entityKind: 'story', entityId: id, entityRef: ref, entityTitle: input.title, action: 'created', detail: 'Historia creada' })
  recordSprintHistory(input.sprintId ?? null)
  return withTags<Story>(db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as Row)
}

function createTask(input: ItemInput): Task {
  const db = getDb()
  const id = uid()
  const stamp = now()
  const statusId = input.statusId ?? firstStatus(input.projectId, 'task')
  const ref = nextRef(input.projectId)
  ensureTags(input.projectId, input.tags)
  // Una tarea hereda el sprint de su historia si no se indica otro.
  let sprintId = input.sprintId ?? null
  if (!sprintId && input.storyId) {
    const parent = db.prepare('SELECT sprintId FROM stories WHERE id = ?').get(input.storyId) as { sprintId: string | null } | undefined
    sprintId = parent?.sprintId ?? null
  }
  db.prepare(
    `INSERT INTO tasks (id, projectId, ref, storyId, sprintId, statusId, title, description, priority,
       blocked, dueDate, tags, position, createdAt, updatedAt, closedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.projectId, ref, input.storyId ?? null, sprintId, statusId, input.title.trim(),
    input.description ?? '', input.priority ?? 'normal', input.dueDate ?? null, JSON.stringify(input.tags ?? []),
    positionFor('tasks', 'projectId = ?', [input.projectId], input.atTop), stamp, stamp, isClosedStatus(statusId) ? stamp : null)
  logActivity({ projectId: input.projectId, entityKind: 'task', entityId: id, entityRef: ref, entityTitle: input.title, action: 'created', detail: 'Tarea creada' })
  return withTags<Task>(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row)
}

function createIssue(input: ItemInput): Issue {
  const db = getDb()
  const id = uid()
  const stamp = now()
  const statusId = input.statusId ?? firstStatus(input.projectId, 'issue')
  const ref = nextRef(input.projectId)
  ensureTags(input.projectId, input.tags)
  db.prepare(
    `INSERT INTO issues (id, projectId, ref, sprintId, statusId, title, description, type, severity, priority,
       blocked, dueDate, tags, position, createdAt, updatedAt, closedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.projectId, ref, input.sprintId ?? null, statusId, input.title.trim(), input.description ?? '',
    input.type ?? 'bug', input.severity ?? 'normal', input.priority ?? 'normal', input.dueDate ?? null,
    JSON.stringify(input.tags ?? []), positionFor('issues', 'projectId = ?', [input.projectId], input.atTop),
    stamp, stamp, isClosedStatus(statusId) ? stamp : null)
  logActivity({ projectId: input.projectId, entityKind: 'issue', entityId: id, entityRef: ref, entityTitle: input.title, action: 'created', detail: 'Incidencia creada' })
  return withTags<Issue>(db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Row)
}

const TABLE_OF: Record<ItemKind, string> = { story: 'stories', task: 'tasks', issue: 'issues' }

function updateItem(kind: ItemKind, id: ID, patch: Row): void {
  const db = getDb()
  const table = TABLE_OF[kind]
  const before = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined
  if (!before) return
  // Al cambiar de estado se ajusta closedAt automáticamente.
  if (patch.statusId && patch.statusId !== before.statusId) {
    const closing = isClosedStatus(patch.statusId as string)
    patch.closedAt = closing ? now() : null
  }
  ensureTags(before.projectId as string, patch.tags as string[] | undefined)
  patchRow(table, id, patch)

  const detail = Object.keys(patch).filter((k) => k !== 'position' && k !== 'closedAt')
  if (detail.length) {
    const nameOf: Record<string, string> = {
      statusId: 'estado', sprintId: 'sprint', epicId: 'épica', points: 'puntos', title: 'título',
      description: 'descripción', priority: 'prioridad', tags: 'etiquetas', blocked: 'bloqueo',
      dueDate: 'fecha límite', severity: 'severidad', type: 'tipo', storyId: 'historia'
    }
    logActivity({
      projectId: before.projectId as string, entityKind: kind, entityId: id,
      entityRef: before.ref as number, entityTitle: (patch.title as string) ?? (before.title as string),
      action: 'updated', detail: detail.map((k) => nameOf[k] ?? k).join(', ')
    })
  }
  if (kind === 'story') {
    recordSprintHistory(before.sprintId as string | null)
    if (patch.sprintId !== undefined) recordSprintHistory(patch.sprintId as string | null)
    // Las tareas siguen al sprint de su historia.
    if (patch.sprintId !== undefined) {
      db.prepare('UPDATE tasks SET sprintId = ? WHERE storyId = ?').run((patch.sprintId as string) ?? null, id)
    }
  }
}

function removeItem(kind: ItemKind, id: ID): void {
  const db = getDb()
  const table = TABLE_OF[kind]
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined
  if (!row) return
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  db.prepare('DELETE FROM comments WHERE entityKind = ? AND entityId = ?').run(kind, id)
  logActivity({
    projectId: row.projectId as string, entityKind: kind, entityId: id, entityRef: row.ref as number,
    entityTitle: row.title as string, action: 'deleted', detail: 'Eliminado'
  })
  if (kind === 'story') recordSprintHistory(row.sprintId as string | null)
}

/* -------------------------------------------------------------- búsqueda */

export interface SearchHit {
  kind: ItemKind | 'epic' | 'wiki'
  id: ID
  projectId: ID
  projectName: string
  prefix: string
  ref: number | null
  title: string
  snippet: string
}

function search(query: string, projectId?: ID): SearchHit[] {
  const q = query.trim()
  if (q.length < 2) return []
  const like = `%${q.toLowerCase()}%`
  const db = getDb()
  const scope = projectId ? 'AND x.projectId = ?' : ''
  const params = projectId ? [like, like, projectId] : [like, like]
  const queries: Array<[SearchHit['kind'], string, string]> = [
    ['story', 'stories', 'title'],
    ['task', 'tasks', 'title'],
    ['issue', 'issues', 'title'],
    ['epic', 'epics', 'title'],
    ['wiki', 'wiki', 'title']
  ]
  const hits: SearchHit[] = []
  for (const [kind, table, titleCol] of queries) {
    const body = table === 'wiki' ? 'content' : 'description'
    const refCol = table === 'wiki' ? 'NULL' : 'x.ref'
    const rows = db.prepare(
      `SELECT x.id, x.projectId, ${refCol} AS ref, x.${titleCol} AS title, x.${body} AS body, p.name AS projectName, p.prefix AS prefix
       FROM ${table} x JOIN projects p ON p.id = x.projectId
       WHERE (LOWER(x.${titleCol}) LIKE ? OR LOWER(x.${body}) LIKE ?) ${scope}
       ORDER BY x.updatedAt DESC LIMIT 25`
    ).all(...(params as never[])) as Array<Row>
    for (const r of rows) {
      const body2 = String(r.body ?? '')
      const at = body2.toLowerCase().indexOf(q.toLowerCase())
      hits.push({
        kind, id: r.id as string, projectId: r.projectId as string, projectName: r.projectName as string,
        prefix: r.prefix as string, ref: (r.ref as number) ?? null, title: r.title as string,
        snippet: at >= 0 ? body2.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' ') : ''
      })
    }
  }
  return hits
}

/* ------------------------------------------------------------ comentarios */

function listComments(entityKind: string, entityId: ID): Comment[] {
  return getDb().prepare('SELECT * FROM comments WHERE entityKind = ? AND entityId = ? ORDER BY createdAt')
    .all(entityKind, entityId) as unknown as Comment[]
}

/* ------------------------------------------------------------- exportación */

function exportAll(): string {
  const db = getDb()
  const tables = ['projects', 'statuses', 'epics', 'sprints', 'stories', 'tasks', 'issues', 'wiki', 'comments', 'tags', 'activity', 'sprint_history']
  const data: Record<string, unknown[]> = {}
  for (const t of tables) data[t] = db.prepare(`SELECT * FROM ${t}`).all() as unknown[]
  return JSON.stringify({ app: 'orbit', version: 1, exportedAt: now(), data }, null, 2)
}

function importAll(json: string, mode: 'merge' | 'replace'): { projects: number } {
  const parsed = JSON.parse(json) as { data?: Record<string, Row[]> }
  if (!parsed.data) throw new Error('El fichero no tiene el formato de exportación de Orbit')
  const db = getDb()
  const tables = ['projects', 'statuses', 'epics', 'sprints', 'stories', 'tasks', 'issues', 'wiki', 'comments', 'tags', 'activity', 'sprint_history']
  db.exec('BEGIN')
  try {
    // En orden inverso (hijos antes que padres) para no violar las claves ajenas.
    if (mode === 'replace') {
      for (const t of [...tables].reverse()) db.prepare(`DELETE FROM ${t}`).run()
    }
    for (const t of tables) {
      const rows = parsed.data[t] ?? []
      for (const row of rows) {
        const cols = Object.keys(row)
        if (!cols.length) continue
        db.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
          .run(...(cols.map((c) => row[c] ?? null) as never[]))
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { projects: (parsed.data.projects ?? []).length }
}

/* ------------------------------------------------------------ datos demo */

function seedDemo(): Project {
  const project = createProject({
    name: 'Ejemplo: Portal de clientes',
    prefix: 'DEMO',
    description: 'Proyecto de ejemplo para ver cómo encajan backlog, sprints y tablero.',
    color: '#14b8a6'
  })
  const db = getDb()
  const stamp = now()
  const epicId = uid()
  db.prepare('INSERT INTO epics (id, projectId, ref, title, description, color, closed, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)')
    .run(epicId, project.id, nextRef(project.id), 'Autenticación', 'Registro, login y recuperación de contraseña', '#8b5cf6', stamp, stamp)

  const sprintId = uid()
  const start = new Date()
  start.setDate(start.getDate() - 4)
  const end = new Date(start)
  end.setDate(end.getDate() + 13)
  db.prepare('INSERT INTO sprints (id, projectId, name, goal, startDate, endDate, closed, position, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)')
    .run(sprintId, project.id, 'Sprint 1', 'Dejar el login funcionando de punta a punta', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), stamp)

  const statuses = db.prepare('SELECT * FROM statuses WHERE projectId = ? AND kind = ? ORDER BY position').all(project.id, 'story') as unknown as Status[]
  const demo: Array<[string, number, number, string[], boolean]> = [
    ['Formulario de registro con validación', 3, 4, ['frontend'], true],
    ['Endpoint de login con JWT', 5, 2, ['backend', 'api'], true],
    ['Recuperar contraseña por email', 3, 1, ['backend'], true],
    ['Pantalla de perfil de usuario', 2, 0, ['frontend'], true],
    ['Exportar listado de clientes a CSV', 2, 0, [], false],
    ['Panel de métricas de uso', 8, 0, ['frontend'], false],
    ['Migrar sesiones a Redis', 5, 0, ['infra'], false]
  ]
  demo.forEach(([title, points, statusIdx, tags, inSprint]) => {
    createStory({
      projectId: project.id, title, points, tags,
      statusId: statuses[statusIdx].id,
      sprintId: inSprint ? sprintId : null,
      epicId: title.toLowerCase().includes('login') || title.toLowerCase().includes('registro') || title.toLowerCase().includes('contraseña') ? epicId : null
    })
  })
  const firstStory = db.prepare('SELECT id FROM stories WHERE projectId = ? ORDER BY position LIMIT 1').get(project.id) as { id: string }
  for (const t of ['Maquetar el formulario', 'Validaciones de cliente', 'Tests del formulario']) {
    createTask({ projectId: project.id, title: t, storyId: firstStory.id })
  }
  createIssue({ projectId: project.id, title: 'El login falla con emails en mayúsculas', type: 'bug', severity: 'important', priority: 'high', tags: ['backend'] })
  createIssue({ projectId: project.id, title: 'Añadir modo oscuro al portal', type: 'enhancement', severity: 'minor' })
  return project
}

/* ---------------------------------------------------------------- export */

export const api = {
  'project.list': () => listProjects(),
  'project.get': (id: ID) => getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as Project | undefined,
  'project.create': (input: { name: string; prefix?: string; description?: string; color?: string }) => createProject(input),
  'project.update': (id: ID, patch: Row) => {
    if (typeof patch.name === 'string') patch.slug = slugify(patch.name)
    patchRow('projects', id, patch)
  },
  'project.remove': (id: ID) => { getDb().prepare('DELETE FROM projects WHERE id = ?').run(id) },
  'project.reorder': (ids: ID[]) => reorder('projects', ids),
  'project.snapshot': (id: ID) => snapshot(id),
  'project.seedDemo': () => seedDemo(),

  'status.create': (input: { projectId: ID; kind: ItemKind; name: string; color?: string; isClosed?: boolean }) => {
    const id = uid()
    getDb().prepare('INSERT INTO statuses (id, projectId, kind, name, color, isClosed, wipLimit, position) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(id, input.projectId, input.kind, input.name.trim(), input.color ?? '#94a3b8', input.isClosed ? 1 : 0,
        nextPosition('statuses', 'projectId = ? AND kind = ?', [input.projectId, input.kind]))
    return id
  },
  'status.update': (id: ID, patch: Row) => patchRow('statuses', id, patch),
  'status.remove': (id: ID, fallbackStatusId: ID) => {
    const db = getDb()
    const row = db.prepare('SELECT kind FROM statuses WHERE id = ?').get(id) as { kind: ItemKind } | undefined
    if (!row) return
    const table = TABLE_OF[row.kind]
    db.prepare(`UPDATE ${table} SET statusId = ? WHERE statusId = ?`).run(fallbackStatusId, id)
    db.prepare('DELETE FROM statuses WHERE id = ?').run(id)
  },
  'status.reorder': (ids: ID[]) => reorder('statuses', ids),

  'epic.create': (input: { projectId: ID; title: string; description?: string; color?: string }) => {
    const id = uid()
    const stamp = now()
    getDb().prepare('INSERT INTO epics (id, projectId, ref, title, description, color, closed, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
      .run(id, input.projectId, nextRef(input.projectId), input.title.trim(), input.description ?? '',
        input.color ?? '#8b5cf6', nextPosition('epics', 'projectId = ?', [input.projectId]), stamp, stamp)
    logActivity({ projectId: input.projectId, entityKind: 'epic', entityId: id, entityRef: null, entityTitle: input.title, action: 'created', detail: 'Épica creada' })
    return id
  },
  'epic.update': (id: ID, patch: Row) => patchRow('epics', id, patch),
  'epic.remove': (id: ID) => { getDb().prepare('DELETE FROM epics WHERE id = ?').run(id) },
  'epic.reorder': (ids: ID[]) => reorder('epics', ids),

  'sprint.create': (input: { projectId: ID; name: string; goal?: string; startDate?: string | null; endDate?: string | null }) => {
    const id = uid()
    getDb().prepare('INSERT INTO sprints (id, projectId, name, goal, startDate, endDate, closed, position, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
      .run(id, input.projectId, input.name.trim(), input.goal ?? '', input.startDate ?? null, input.endDate ?? null,
        nextPosition('sprints', 'projectId = ?', [input.projectId]), now())
    logActivity({ projectId: input.projectId, entityKind: 'project', entityId: id, entityRef: null, entityTitle: input.name, action: 'sprint', detail: 'Sprint creado' })
    return id
  },
  'sprint.update': (id: ID, patch: Row) => patchRow('sprints', id, patch, false),
  'sprint.remove': (id: ID) => { getDb().prepare('DELETE FROM sprints WHERE id = ?').run(id) },
  'sprint.reorder': (ids: ID[]) => reorder('sprints', ids),
  'sprint.burndown': (id: ID) => burndown(id),

  'story.create': (input: ItemInput) => createStory(input),
  'story.update': (id: ID, patch: Row) => updateItem('story', id, patch),
  'story.remove': (id: ID) => removeItem('story', id),
  'story.reorder': (ids: ID[]) => reorder('stories', ids),

  'task.create': (input: ItemInput) => createTask(input),
  'task.update': (id: ID, patch: Row) => updateItem('task', id, patch),
  'task.remove': (id: ID) => removeItem('task', id),
  'task.reorder': (ids: ID[]) => reorder('tasks', ids),

  'issue.create': (input: ItemInput) => createIssue(input),
  'issue.update': (id: ID, patch: Row) => updateItem('issue', id, patch),
  'issue.remove': (id: ID) => removeItem('issue', id),
  'issue.reorder': (ids: ID[]) => reorder('issues', ids),

  'wiki.create': (input: { projectId: ID; title: string; content?: string }) => {
    const id = uid()
    const stamp = now()
    getDb().prepare('INSERT INTO wiki (id, projectId, slug, title, content, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId, slugify(input.title), input.title.trim(), input.content ?? '',
        nextPosition('wiki', 'projectId = ?', [input.projectId]), stamp, stamp)
    return id
  },
  'wiki.update': (id: ID, patch: Row) => {
    if (typeof patch.title === 'string') patch.slug = slugify(patch.title)
    patchRow('wiki', id, patch)
  },
  'wiki.remove': (id: ID) => { getDb().prepare('DELETE FROM wiki WHERE id = ?').run(id) },
  'wiki.reorder': (ids: ID[]) => reorder('wiki', ids),

  'comment.list': (entityKind: string, entityId: ID) => listComments(entityKind, entityId),
  'comment.create': (input: { projectId: ID; entityKind: string; entityId: ID; body: string }) => {
    const id = uid()
    getDb().prepare('INSERT INTO comments (id, projectId, entityKind, entityId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.projectId, input.entityKind, input.entityId, input.body, now())
    return id
  },
  'comment.remove': (id: ID) => { getDb().prepare('DELETE FROM comments WHERE id = ?').run(id) },

  'tag.upsert': (projectId: ID, name: string, color: string) => {
    getDb().prepare('INSERT INTO tags (projectId, name, color) VALUES (?, ?, ?) ON CONFLICT(projectId, name) DO UPDATE SET color = excluded.color')
      .run(projectId, name, color)
  },
  'tag.remove': (projectId: ID, name: string) => { getDb().prepare('DELETE FROM tags WHERE projectId = ? AND name = ?').run(projectId, name) },

  'search': (query: string, projectId?: ID) => search(query, projectId),
  'data.export': () => exportAll(),
  'data.import': (json: string, mode: 'merge' | 'replace') => importAll(json, mode)
}

export type Api = typeof api
export type ApiMethod = keyof Api
