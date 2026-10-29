import { create } from 'zustand'
import { api } from '../lib/api'
import type { ID, ProjectSnapshot, ProjectSummary } from '../../../shared/types'

export type ViewName = 'dashboard' | 'backlog' | 'sprint' | 'kanban' | 'issues' | 'epics' | 'wiki' | 'settings'

export interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  message: string
}

export interface OpenItem {
  kind: 'story' | 'task' | 'issue'
  id: ID
}

interface Filters {
  text: string
  tags: string[]
  epicId: ID | null
  priority: string | null
  hideClosed: boolean
}

const EMPTY_FILTERS: Filters = { text: '', tags: [], epicId: null, priority: null, hideClosed: false }

interface State {
  ready: boolean
  projects: ProjectSummary[]
  currentId: ID | null
  snap: ProjectSnapshot | null
  view: ViewName
  sprintId: ID | null
  /** Filtro propio del Tablero: '__all__', '__backlog__' o el id de un sprint. */
  boardSprint: string
  openItem: OpenItem | null
  paletteOpen: boolean
  shortcutsOpen: boolean
  sidebarOpen: boolean
  filters: Filters
  toasts: Toast[]
  busy: boolean

  init: () => Promise<void>
  loadProjects: () => Promise<void>
  selectProject: (id: ID | null) => Promise<void>
  refresh: () => Promise<void>
  run: <T>(action: () => Promise<T>, message?: string) => Promise<T | undefined>
  setView: (view: ViewName) => void
  setSprint: (id: ID | null) => void
  setBoardSprint: (value: string) => void
  setOpenItem: (item: OpenItem | null) => void
  setPalette: (open: boolean) => void
  setShortcuts: (open: boolean) => void
  toggleSidebar: () => void
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  toast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void
}

const LAST_PROJECT = 'orbit:lastProject'
let toastSeq = 0

export const useStore = create<State>((set, get) => ({
  ready: false,
  projects: [],
  currentId: null,
  snap: null,
  view: 'dashboard',
  sprintId: null,
  boardSprint: '__all__',
  openItem: null,
  paletteOpen: false,
  shortcutsOpen: false,
  sidebarOpen: true,
  filters: EMPTY_FILTERS,
  toasts: [],
  busy: false,

  async init() {
    const projects = await api.listProjects()
    set({ projects })
    const remembered = localStorage.getItem(LAST_PROJECT)
    const target = projects.find((p) => p.project.id === remembered) ?? projects.find((p) => !p.project.archived)
    if (target) await get().selectProject(target.project.id)
    set({ ready: true })
  },

  async loadProjects() {
    set({ projects: await api.listProjects() })
  },

  async selectProject(id) {
    if (!id) {
      localStorage.removeItem(LAST_PROJECT)
      set({ currentId: null, snap: null, filters: EMPTY_FILTERS, sprintId: null })
      return
    }
    const snap = await api.snapshot(id)
    if (!snap) {
      set({ currentId: null, snap: null })
      return
    }
    localStorage.setItem(LAST_PROJECT, id)
    const openSprint = [...snap.sprints].reverse().find((s) => !s.closed) ?? snap.sprints[snap.sprints.length - 1] ?? null
    set({ currentId: id, snap, filters: EMPTY_FILTERS, sprintId: openSprint?.id ?? null })
  },

  async refresh() {
    const { currentId } = get()
    const projects = await api.listProjects()
    if (!currentId) {
      set({ projects })
      return
    }
    const snap = await api.snapshot(currentId)
    const sprintId = get().sprintId
    const stillThere = snap?.sprints.some((s) => s.id === sprintId)
    set({
      projects,
      snap,
      sprintId: stillThere ? sprintId : ([...(snap?.sprints ?? [])].reverse().find((s) => !s.closed)?.id ?? null)
    })
  },

  async run(action, message) {
    set({ busy: true })
    try {
      const result = await action()
      await get().refresh()
      if (message) get().toast('ok', message)
      return result
    } catch (error) {
      get().toast('error', (error as Error).message.replace(/^Error invoking remote method '\w+':\s*/, ''))
      return undefined
    } finally {
      set({ busy: false })
    }
  },

  setView: (view) => set({ view }),
  setSprint: (sprintId) => set({ sprintId }),
  setBoardSprint: (boardSprint) => set({ boardSprint }),
  setOpenItem: (openItem) => set({ openItem }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),

  toast(kind, message) {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
