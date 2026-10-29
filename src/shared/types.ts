/** Modelo de dominio compartido entre el proceso main y el renderer. */

export type ID = string
export type ISODate = string

/** Los tres tipos de item que llevan tablero propio. */
export type ItemKind = 'story' | 'task' | 'issue'
export type EntityKind = ItemKind | 'epic' | 'wiki' | 'project'

export interface Project {
  id: ID
  name: string
  slug: string
  /** Prefijo corto para las referencias, p.ej. ORB -> ORB-12 */
  prefix: string
  description: string
  color: string
  archived: 0 | 1
  refCounter: number
  position: number
  createdAt: ISODate
  updatedAt: ISODate
}

export interface Status {
  id: ID
  projectId: ID
  kind: ItemKind
  name: string
  color: string
  /** 1 = la columna cuenta como terminado (cierra el item) */
  isClosed: 0 | 1
  /** 0 = sin límite WIP */
  wipLimit: number
  position: number
}

export interface Epic {
  id: ID
  projectId: ID
  ref: number
  title: string
  description: string
  color: string
  closed: 0 | 1
  position: number
  createdAt: ISODate
  updatedAt: ISODate
}

export interface Sprint {
  id: ID
  projectId: ID
  name: string
  goal: string
  startDate: ISODate | null
  endDate: ISODate | null
  closed: 0 | 1
  position: number
  createdAt: ISODate
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type IssueType = 'bug' | 'enhancement' | 'question' | 'chore'
export type Severity = 'wishlist' | 'minor' | 'normal' | 'important' | 'critical'

export interface Story {
  id: ID
  projectId: ID
  ref: number
  epicId: ID | null
  sprintId: ID | null
  statusId: ID
  title: string
  description: string
  points: number | null
  priority: Priority
  blocked: 0 | 1
  blockedNote: string
  dueDate: ISODate | null
  tags: string[]
  position: number
  createdAt: ISODate
  updatedAt: ISODate
  closedAt: ISODate | null
}

export interface Task {
  id: ID
  projectId: ID
  ref: number
  storyId: ID | null
  sprintId: ID | null
  statusId: ID
  title: string
  description: string
  priority: Priority
  blocked: 0 | 1
  dueDate: ISODate | null
  tags: string[]
  position: number
  createdAt: ISODate
  updatedAt: ISODate
  closedAt: ISODate | null
}

export interface Issue {
  id: ID
  projectId: ID
  ref: number
  sprintId: ID | null
  statusId: ID
  title: string
  description: string
  type: IssueType
  severity: Severity
  priority: Priority
  blocked: 0 | 1
  dueDate: ISODate | null
  tags: string[]
  position: number
  createdAt: ISODate
  updatedAt: ISODate
  closedAt: ISODate | null
}

export interface WikiPage {
  id: ID
  projectId: ID
  slug: string
  title: string
  content: string
  position: number
  createdAt: ISODate
  updatedAt: ISODate
}

export interface Comment {
  id: ID
  projectId: ID
  entityKind: EntityKind
  entityId: ID
  body: string
  createdAt: ISODate
}

export interface Activity {
  id: ID
  projectId: ID
  entityKind: EntityKind
  entityId: ID
  entityRef: number | null
  entityTitle: string
  action: string
  detail: string
  createdAt: ISODate
}

export interface Tag {
  projectId: ID
  name: string
  color: string
}

/** Punto diario de la gráfica burndown de un sprint. */
export interface BurndownPoint {
  date: ISODate
  remaining: number
  ideal: number
}

export interface ProjectSnapshot {
  project: Project
  statuses: Status[]
  epics: Epic[]
  sprints: Sprint[]
  stories: Story[]
  tasks: Task[]
  issues: Issue[]
  wiki: WikiPage[]
  tags: Tag[]
  activity: Activity[]
}

export interface ProjectSummary {
  project: Project
  storyCount: number
  storyClosed: number
  points: number
  pointsClosed: number
  issueOpen: number
  taskOpen: number
  activeSprint: Sprint | null
}

export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent']
export const ISSUE_TYPES: IssueType[] = ['bug', 'enhancement', 'question', 'chore']
export const SEVERITIES: Severity[] = ['wishlist', 'minor', 'normal', 'important', 'critical']
export const POINT_SCALE: (number | null)[] = [null, 0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40]

export const PROJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
]
