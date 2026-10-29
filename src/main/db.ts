import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

let db: DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  prefix TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  archived INTEGER NOT NULL DEFAULT 0,
  refCounter INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  isClosed INTEGER NOT NULL DEFAULT 0,
  wipLimit INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_statuses_project ON statuses(projectId, kind, position);

CREATE TABLE IF NOT EXISTS epics (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  closed INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(projectId, position);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  startDate TEXT,
  endDate TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(projectId, position);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref INTEGER NOT NULL,
  epicId TEXT REFERENCES epics(id) ON DELETE SET NULL,
  sprintId TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  statusId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points REAL,
  priority TEXT NOT NULL DEFAULT 'normal',
  blocked INTEGER NOT NULL DEFAULT 0,
  blockedNote TEXT NOT NULL DEFAULT '',
  dueDate TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  closedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_stories_project ON stories(projectId, position);
CREATE INDEX IF NOT EXISTS idx_stories_sprint ON stories(sprintId);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref INTEGER NOT NULL,
  storyId TEXT REFERENCES stories(id) ON DELETE CASCADE,
  sprintId TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  statusId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  blocked INTEGER NOT NULL DEFAULT 0,
  dueDate TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  closedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(projectId, position);
CREATE INDEX IF NOT EXISTS idx_tasks_story ON tasks(storyId);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ref INTEGER NOT NULL,
  sprintId TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  statusId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'bug',
  severity TEXT NOT NULL DEFAULT 'normal',
  priority TEXT NOT NULL DEFAULT 'normal',
  blocked INTEGER NOT NULL DEFAULT 0,
  dueDate TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  closedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(projectId, position);

CREATE TABLE IF NOT EXISTS wiki (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_project ON wiki(projectId, position);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entityKind TEXT NOT NULL,
  entityId TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entityKind, entityId, createdAt);

CREATE TABLE IF NOT EXISTS tags (
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  PRIMARY KEY (projectId, name)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entityKind TEXT NOT NULL,
  entityId TEXT NOT NULL,
  entityRef INTEGER,
  entityTitle TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(projectId, createdAt DESC);

/** Serie histórica para el burndown: puntos/items pendientes por sprint y día. */
CREATE TABLE IF NOT EXISTS sprint_history (
  sprintId TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  remainingPoints REAL NOT NULL DEFAULT 0,
  totalPoints REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (sprintId, date)
);
`

export function openDatabase(userDataDir: string): DatabaseSync {
  const file = join(userDataDir, 'orbit.db')
  if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
  db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  setMeta('schemaVersion', '1')
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('La base de datos no está abierta todavía')
  return db
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function setMeta(key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function closeDatabase(): void {
  try {
    db?.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db?.close()
  } catch {
    /* ya estaba cerrada */
  }
}
