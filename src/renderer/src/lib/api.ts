import type {
  Activity, BurndownPoint, Comment, Project, ProjectSnapshot, ProjectSummary, ID
} from '../../../shared/types'

export interface SearchHit {
  kind: 'story' | 'task' | 'issue' | 'epic' | 'wiki'
  id: ID
  projectId: ID
  projectName: string
  prefix: string
  ref: number | null
  title: string
  snippet: string
}

const call = <T>(method: string, ...args: unknown[]): Promise<T> => window.orbit.call<T>(method, ...args)

export const api = {
  listProjects: () => call<ProjectSummary[]>('project.list'),
  createProject: (input: { name: string; prefix?: string; description?: string; color?: string }) =>
    call<Project>('project.create', input),
  updateProject: (id: ID, patch: Record<string, unknown>) => call<void>('project.update', id, patch),
  removeProject: (id: ID) => call<void>('project.remove', id),
  reorderProjects: (ids: ID[]) => call<void>('project.reorder', ids),
  snapshot: (id: ID) => call<ProjectSnapshot | null>('project.snapshot', id),
  seedDemo: () => call<Project>('project.seedDemo'),

  createStatus: (input: Record<string, unknown>) => call<ID>('status.create', input),
  updateStatus: (id: ID, patch: Record<string, unknown>) => call<void>('status.update', id, patch),
  removeStatus: (id: ID, fallbackId: ID) => call<void>('status.remove', id, fallbackId),
  reorderStatuses: (ids: ID[]) => call<void>('status.reorder', ids),

  createEpic: (input: Record<string, unknown>) => call<ID>('epic.create', input),
  updateEpic: (id: ID, patch: Record<string, unknown>) => call<void>('epic.update', id, patch),
  removeEpic: (id: ID) => call<void>('epic.remove', id),

  createSprint: (input: Record<string, unknown>) => call<ID>('sprint.create', input),
  updateSprint: (id: ID, patch: Record<string, unknown>) => call<void>('sprint.update', id, patch),
  removeSprint: (id: ID) => call<void>('sprint.remove', id),
  burndown: (id: ID) => call<BurndownPoint[]>('sprint.burndown', id),

  createStory: (input: Record<string, unknown>) => call<unknown>('story.create', input),
  updateStory: (id: ID, patch: Record<string, unknown>) => call<void>('story.update', id, patch),
  removeStory: (id: ID) => call<void>('story.remove', id),
  reorderStories: (ids: ID[]) => call<void>('story.reorder', ids),

  createTask: (input: Record<string, unknown>) => call<unknown>('task.create', input),
  updateTask: (id: ID, patch: Record<string, unknown>) => call<void>('task.update', id, patch),
  removeTask: (id: ID) => call<void>('task.remove', id),
  reorderTasks: (ids: ID[]) => call<void>('task.reorder', ids),

  createIssue: (input: Record<string, unknown>) => call<unknown>('issue.create', input),
  updateIssue: (id: ID, patch: Record<string, unknown>) => call<void>('issue.update', id, patch),
  removeIssue: (id: ID) => call<void>('issue.remove', id),
  reorderIssues: (ids: ID[]) => call<void>('issue.reorder', ids),

  createWiki: (input: Record<string, unknown>) => call<ID>('wiki.create', input),
  updateWiki: (id: ID, patch: Record<string, unknown>) => call<void>('wiki.update', id, patch),
  removeWiki: (id: ID) => call<void>('wiki.remove', id),

  listComments: (entityKind: string, entityId: ID) => call<Comment[]>('comment.list', entityKind, entityId),
  createComment: (input: Record<string, unknown>) => call<ID>('comment.create', input),
  removeComment: (id: ID) => call<void>('comment.remove', id),

  upsertTag: (projectId: ID, name: string, color: string) => call<void>('tag.upsert', projectId, name, color),
  removeTag: (projectId: ID, name: string) => call<void>('tag.remove', projectId, name),

  search: (query: string, projectId?: ID) => call<SearchHit[]>('search', query, projectId)
}

export type { Activity, ProjectSnapshot, ProjectSummary }
