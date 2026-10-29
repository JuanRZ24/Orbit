import { useEffect, useState, type ReactNode } from 'react'
import { Plus, Trash2, BookText, Save, Eye, Pencil } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { cn, formatRelative } from '../lib/ui'
import { Page } from '../components/Page'
import { Confirm, Empty, Markdown } from '../components/ui'

export function Wiki(): ReactNode {
  const { snap, run } = useStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const pages = snap?.wiki ?? []
  const page = pages.find((p) => p.id === selected) ?? pages[0]

  useEffect(() => {
    if (page && !editing) setDraft(page.content)
  }, [page?.id, page?.content, editing])

  useEffect(() => {
    if (!page && pages.length > 0) setSelected(pages[0].id)
  }, [pages.length])

  if (!snap) return null

  const save = (): void => {
    if (!page || draft === page.content) { setEditing(false); return }
    setEditing(false)
    void run(() => api.updateWiki(page.id, { content: draft }), 'Página guardada')
  }

  return (
    <Page
      title="Wiki"
      subtitle={`${pages.length} página(s) de notas del proyecto`}
      scroll={false}
      actions={
        page && (
          editing ? (
            <button className="btn btn-primary" onClick={save}><Save size={15} /> Guardar</button>
          ) : (
            <button className="btn" onClick={() => { setDraft(page.content); setEditing(true) }}>
              <Pencil size={15} /> Editar
            </button>
          )
        )
      }
    >
      <div className="grid h-full gap-4 overflow-hidden md:grid-cols-[220px_1fr]">
        <aside className="flex h-full flex-col overflow-hidden">
          {creating ? (
            <form className="mb-2" onSubmit={(e) => {
              e.preventDefault()
              const title = newTitle.trim()
              if (!title) return
              setNewTitle('')
              setCreating(false)
              void run(async () => {
                const id = await api.createWiki({ projectId: snap.project.id, title, content: `# ${title}\n\n` })
                setSelected(id)
              }, 'Página creada')
            }}>
              <input autoFocus className="field py-1.5 text-[13px]" placeholder="Título de la página"
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onBlur={() => { if (!newTitle.trim()) setCreating(false) }} />
            </form>
          ) : (
            <button className="btn mb-2 justify-center py-1.5 text-[13px]" onClick={() => setCreating(true)}>
              <Plus size={14} /> Nueva página
            </button>
          )}

          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {pages.map((p) => (
              <button key={p.id}
                className={cn('group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]',
                  p.id === page?.id ? 'bg-brand/15 text-ink' : 'text-dim hover:bg-hover hover:text-ink')}
                onClick={() => { setSelected(p.id); setEditing(false) }}>
                <BookText size={14} className={p.id === page?.id ? 'text-brand' : 'text-faint'} />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="text-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); setToDelete(p.id) }} role="button" aria-label="Eliminar página">
                  <Trash2 size={13} />
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex h-full flex-col overflow-hidden">
          {!page ? (
            <Empty icon={<BookText size={26} />} title="Sin páginas"
              hint="Guarda aquí decisiones, enlaces, pasos de despliegue… lo que no cabe en una historia."
              action={<button className="btn btn-primary" onClick={() => setCreating(true)}>Crear página</button>} />
          ) : editing ? (
            <div className="flex h-full flex-col gap-2">
              <input className="field text-[15px] font-semibold" defaultValue={page.title} key={page.id}
                onBlur={(e) => {
                  const t = e.target.value.trim()
                  if (t && t !== page.title) void run(() => api.updateWiki(page.id, { title: t }))
                }} />
              <textarea className="field flex-1 resize-none font-mono text-[13px] leading-relaxed"
                value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Markdown: # títulos, **negrita**, listas, tablas, ```código```"
                onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }} />
              <p className="text-[11px] text-faint">Ctrl+S para guardar · se admite Markdown con tablas y listas de tareas</p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto rounded-xl border border-line bg-panel px-6 py-5">
              <div className="mb-3 flex items-baseline justify-between border-b border-line pb-3">
                <h2 className="text-lg font-semibold">{page.title}</h2>
                <span className="text-[11px] text-faint">Actualizada {formatRelative(page.updatedAt)}</span>
              </div>
              {page.content.trim() ? (
                <Markdown className="text-[13.5px]">{page.content}</Markdown>
              ) : (
                <button className="w-full rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint hover:bg-hover"
                  onClick={() => { setDraft(page.content); setEditing(true) }}>
                  <Eye size={18} className="mx-auto mb-2 opacity-60" />
                  Página vacía. Haz clic para escribir.
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <Confirm open={!!toDelete} title="Eliminar página"
        message="Se borrará el contenido de esta página de la wiki."
        onConfirm={() => {
          if (!toDelete) return
          if (toDelete === page?.id) setSelected(null)
          void run(() => api.removeWiki(toDelete), 'Página eliminada')
        }}
        onClose={() => setToDelete(null)} />
    </Page>
  )
}
