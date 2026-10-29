import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, ListTodo, Bug, Layers, BookText, CornerDownLeft, LayoutDashboard,
  Rocket, Columns3, Settings, FolderOpen
} from 'lucide-react'
import { api, type SearchHit } from '../lib/api'
import { useStore, type ViewName } from '../store/useStore'
import { cn, refLabel } from '../lib/ui'
import { Dot } from './ui'

interface Command {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
}

const KIND_ICON: Record<SearchHit['kind'], ReactNode> = {
  story: <ListTodo size={15} className="text-sky-400" />,
  task: <ListTodo size={15} className="text-emerald-400" />,
  issue: <Bug size={15} className="text-red-400" />,
  epic: <Layers size={15} className="text-violet-400" />,
  wiki: <BookText size={15} className="text-amber-400" />
}

const VIEW_ICON: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard size={15} />, backlog: <ListTodo size={15} />, sprint: <Rocket size={15} />,
  kanban: <Columns3 size={15} />, issues: <Bug size={15} />, epics: <Layers size={15} />,
  wiki: <BookText size={15} />, settings: <Settings size={15} />
}

export function CommandPalette(): ReactNode {
  const { paletteOpen, setPalette, projects, currentId, selectProject, setView, setOpenItem, snap } = useStore()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!paletteOpen) { setQuery(''); setHits([]); setCursor(0) }
  }, [paletteOpen])

  useEffect(() => {
    if (!paletteOpen) return
    const q = query.trim()
    if (q.length < 2) { setHits([]); return }
    let alive = true
    const timer = setTimeout(() => {
      api.search(q).then((r) => { if (alive) setHits(r) })
    }, 120)
    return () => { alive = false; clearTimeout(timer) }
  }, [query, paletteOpen])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []
    const views: Array<[ViewName, string]> = [
      ['dashboard', 'Resumen'], ['backlog', 'Backlog'], ['sprint', 'Sprint'], ['kanban', 'Tablero'],
      ['issues', 'Incidencias'], ['epics', 'Épicas'], ['wiki', 'Wiki'], ['settings', 'Ajustes del proyecto']
    ]
    if (currentId) {
      for (const [view, label] of views) {
        list.push({ id: `view:${view}`, label: `Ir a ${label}`, icon: VIEW_ICON[view], run: () => setView(view) })
      }
    }
    for (const p of projects.filter((p) => !p.project.archived)) {
      list.push({
        id: `project:${p.project.id}`,
        label: `Abrir ${p.project.name}`,
        hint: 'proyecto',
        icon: <Dot color={p.project.color} />,
        run: () => void selectProject(p.project.id)
      })
    }
    list.push({
      id: 'project:all', label: 'Ver todos los proyectos', icon: <FolderOpen size={15} />,
      run: () => void selectProject(null)
    })
    const q = query.trim().toLowerCase()
    if (!q) return list.slice(0, 8)
    return list.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 6)
  }, [projects, currentId, query, setView, selectProject])

  const rows: Array<{ key: string; run: () => void; node: ReactNode }> = [
    ...commands.map((c) => ({
      key: c.id,
      run: c.run,
      node: (
        <>
          <span className="text-faint">{c.icon}</span>
          <span className="flex-1 truncate">{c.label}</span>
          {c.hint && <span className="text-[11px] text-faint">{c.hint}</span>}
        </>
      )
    })),
    ...hits.map((h) => ({
      key: `${h.kind}:${h.id}`,
      run: () => {
        if (h.projectId !== currentId) void selectProject(h.projectId)
        if (h.kind === 'wiki') setView('wiki')
        else if (h.kind === 'epic') setView('epics')
        else setTimeout(() => setOpenItem({ kind: h.kind as 'story' | 'task' | 'issue', id: h.id }), h.projectId !== currentId ? 150 : 0)
      },
      node: (
        <>
          <span>{KIND_ICON[h.kind]}</span>
          <span className="flex-1 truncate">
            <span className="mr-1.5 font-mono text-[11px] text-faint">{refLabel(h.prefix, h.ref)}</span>
            {h.title}
            {h.snippet && <span className="ml-2 text-[11px] text-faint">{h.snippet}</span>}
          </span>
          {h.projectId !== currentId && <span className="shrink-0 text-[11px] text-faint">{h.projectName}</span>}
        </>
      )
    }))
  ]

  useEffect(() => { setCursor(0) }, [query, hits.length])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!paletteOpen) return null

  const choose = (index: number): void => {
    const row = rows[index]
    if (!row) return
    setPalette(false)
    row.run()
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-6 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setPalette(false) }}>
      <div className="card pop-in w-full max-w-xl overflow-hidden shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
            placeholder={snap ? `Buscar en todo… (${snap.project.name} y el resto)` : 'Buscar o ir a…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); choose(cursor) }
              if (e.key === 'Escape') setPalette(false)
            }}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">
              {query.trim().length < 2 ? 'Escribe para buscar historias, tareas, incidencias y wiki.' : 'Sin resultados.'}
            </p>
          ) : rows.map((row, i) => (
            <button
              key={row.key}
              data-active={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(i)}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]',
                i === cursor ? 'bg-hover' : 'hover:bg-hover/60')}
            >
              {row.node}
              {i === cursor && <CornerDownLeft size={13} className="shrink-0 text-faint" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
