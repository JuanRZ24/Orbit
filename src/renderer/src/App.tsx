import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PanelLeftOpen, Plus } from 'lucide-react'
import { api } from './lib/api'
import { cn } from './lib/ui'
import { useStore, type ViewName } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { CommandPalette } from './components/CommandPalette'
import { ItemDialog } from './components/ItemDialog'
import { ProjectDialog } from './components/ProjectDialog'
import { Modal } from './components/ui'
import { Home } from './views/Home'
import { Dashboard } from './views/Dashboard'
import { Backlog } from './views/Backlog'
import { Kanban } from './views/Kanban'
import { SprintView } from './views/SprintView'
import { Issues } from './views/Issues'
import { Epics } from './views/Epics'
import { Wiki } from './views/Wiki'
import { Settings } from './views/Settings'

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl K', 'Buscar en todo / paleta de comandos'],
  ['Ctrl N', 'Nueva historia en el proyecto actual'],
  ['Ctrl Shift N', 'Nuevo proyecto'],
  ['Ctrl 1 … 7', 'Cambiar de vista'],
  ['Ctrl B', 'Mostrar u ocultar el panel lateral'],
  ['Esc', 'Cerrar el diálogo abierto'],
  ['Doble clic', 'Editar un título en el sitio'],
  ['Arrastrar', 'Reordenar y mover entre columnas o sprints']
]

function ShortcutsModal(): ReactNode {
  const { shortcutsOpen, setShortcuts } = useStore()
  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcuts(false)} title="Atajos de teclado" width="max-w-md">
      <dl className="space-y-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys} className="flex items-baseline gap-3">
            <dt className="w-32 shrink-0">
              {keys.split(' ').map((k) => (
                <kbd key={k} className="mr-1 rounded border border-line bg-app px-1.5 py-0.5 font-mono text-[11px] text-dim">{k}</kbd>
              ))}
            </dt>
            <dd className="flex-1 text-[13px] text-dim">{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}

function QuickStory({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const { snap, run, setOpenItem } = useStore()
  const [title, setTitle] = useState('')
  useEffect(() => { if (open) setTitle('') }, [open])
  if (!snap) return null

  const submit = (): void => {
    const clean = title.trim()
    if (!clean) return
    onClose()
    void run(async () => {
      const created = await api.createStory({ projectId: snap.project.id, title: clean, atTop: true }) as { id: string }
      if (created?.id) setOpenItem({ kind: 'story', id: created.id })
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva historia" subtitle={snap.project.name} width="max-w-lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!title.trim()}>Crear y abrir</button>
        </>
      }>
      <input autoFocus className="field" placeholder="¿Qué hay que hacer?"
        value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
    </Modal>
  )
}

const VIEWS: Record<ViewName, () => ReactNode> = {
  dashboard: Dashboard, backlog: Backlog, sprint: SprintView, kanban: Kanban,
  issues: Issues, epics: Epics, wiki: Wiki, settings: Settings
}

export default function App(): ReactNode {
  const {
    ready, init, currentId, view, setView, setPalette, setShortcuts, sidebarOpen,
    toggleSidebar, refresh, toast, openItem, paletteOpen, shortcutsOpen
  } = useStore()
  const [newProject, setNewProject] = useState(false)
  const [quickStory, setQuickStory] = useState(false)

  useEffect(() => { void init() }, [init])

  const anyDialogOpen = !!openItem || paletteOpen || shortcutsOpen || newProject || quickStory

  const onKey = useCallback((e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return }
    if (mod && e.key.toLowerCase() === 'b' && !typing) { e.preventDefault(); toggleSidebar(); return }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setNewProject(true); return }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'n' && currentId) { e.preventDefault(); setQuickStory(true); return }
    if (mod && !typing && /^[1-7]$/.test(e.key) && currentId) {
      e.preventDefault()
      const order: ViewName[] = ['dashboard', 'backlog', 'sprint', 'kanban', 'issues', 'epics', 'wiki']
      setView(order[Number(e.key) - 1])
    }
    if (e.key === '?' && !typing && !anyDialogOpen) { e.preventDefault(); setShortcuts(true) }
  }, [currentId, setPalette, setShortcuts, setView, toggleSidebar, anyDialogOpen])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  useEffect(() => {
    return window.orbit.onMenu(({ channel, payload }) => {
      switch (channel) {
        case 'view': setView(payload as ViewName); break
        case 'search.open': setPalette(true); break
        case 'project.new': setNewProject(true); break
        case 'story.new': if (useStore.getState().currentId) setQuickStory(true); break
        case 'help.shortcuts': setShortcuts(true); break
        case 'data.reload': void useStore.getState().init(); break
        case 'toast': {
          const t = payload as { kind: 'ok' | 'error'; message: string }
          toast(t.kind, t.message)
          break
        }
      }
    })
  }, [setView, setPalette, setShortcuts, toast, refresh])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-faint">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
          <span className="text-[13px]">Abriendo Orbit…</span>
        </div>
      </div>
    )
  }

  const Current = currentId ? VIEWS[view] : Home

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && <Sidebar onNewProject={() => setNewProject(true)} />}

      <main className="relative flex-1 overflow-hidden">
        {!sidebarOpen && (
          <button className="absolute left-3 top-3.5 z-20 rounded-lg border border-line bg-panel p-1.5 text-faint hover:text-ink"
            onClick={toggleSidebar} title="Mostrar panel (Ctrl+B)">
            <PanelLeftOpen size={15} />
          </button>
        )}
        <div className={cn('h-full', !sidebarOpen && 'pl-10')}>
          <Current />
        </div>
      </main>

      {currentId && (
        <button
          className="btn btn-primary fixed bottom-5 right-5 z-30 h-11 w-11 justify-center rounded-full p-0 shadow-lg shadow-black/40"
          onClick={() => setQuickStory(true)}
          title="Nueva historia (Ctrl+N)"
        >
          <Plus size={19} />
        </button>
      )}

      <ItemDialog />
      <CommandPalette />
      <ShortcutsModal />
      <QuickStory open={quickStory} onClose={() => setQuickStory(false)} />
      <ProjectDialog open={newProject} onClose={() => setNewProject(false)} />
      <Toasts />
    </div>
  )
}
