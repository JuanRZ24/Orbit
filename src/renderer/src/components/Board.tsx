import { useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Plus, AlertTriangle } from 'lucide-react'
import type { Epic, Issue, ItemKind, Status, Story, Tag, Task } from '../../../shared/types'
import { cn, alpha, reorderGlobal, sumPoints } from '../lib/ui'
import { ItemCardBody, SortableCard, type CardItem } from './ItemCard'

type BoardItem = Story | Task | Issue

function Column({
  status, items, children, onQuickAdd, showPoints
}: {
  status: Status
  items: BoardItem[]
  children: ReactNode
  onQuickAdd?: (title: string) => void
  showPoints?: boolean
}): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const overLimit = status.wipLimit > 0 && items.length > status.wipLimit

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.color }} />
        <span className="truncate text-[12px] font-semibold uppercase tracking-wide">{status.name}</span>
        <span className={cn('font-mono text-[11px]', overLimit ? 'text-red-400' : 'text-faint')}>
          {items.length}{status.wipLimit > 0 && `/${status.wipLimit}`}
        </span>
        {overLimit && <AlertTriangle size={12} className="text-red-400" />}
        {showPoints && (
          <span className="ml-auto font-mono text-[11px] text-faint">{sumPoints(items as Story[])} pts</span>
        )}
        {onQuickAdd && (
          <button className={cn('rounded p-0.5 text-faint hover:bg-hover hover:text-ink', !showPoints && 'ml-auto')}
            onClick={() => setAdding(true)} aria-label={`Añadir en ${status.name}`}>
            <Plus size={14} />
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 rounded-xl border border-transparent p-1.5 transition-colors',
          isOver && 'border-brand/40 bg-brand/5'
        )}
        style={{ background: isOver ? undefined : alpha(status.color, 4) }}
      >
        {adding && onQuickAdd && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const title = draft.trim()
              if (title) onQuickAdd(title)
              setDraft('')
              setAdding(false)
            }}
          >
            <textarea
              autoFocus
              rows={2}
              className="field resize-none text-[13px]"
              placeholder="Título y Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => {
                const title = e.target.value.trim()
                if (title) onQuickAdd(title)
                setDraft('')
                setAdding(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') { setDraft(''); setAdding(false) }
              }}
            />
          </form>
        )}
        {children}
        {items.length === 0 && !adding && (
          <div className="rounded-lg border border-dashed border-line/60 px-3 py-6 text-center text-[11px] text-faint">
            Arrastra aquí
          </div>
        )}
      </div>
    </div>
  )
}

export function Board({
  kind, items, statuses, epics, tags, prefix, onOpen, onMove, onQuickAdd, taskCounts, showPoints, epicAccent
}: {
  kind: ItemKind
  items: BoardItem[]
  statuses: Status[]
  epics: Epic[]
  tags: Tag[]
  prefix: string
  onOpen: (id: string) => void
  onMove: (orderedIds: string[], movedId: string, statusId: string) => void
  onQuickAdd?: (statusId: string, title: string) => void
  taskCounts?: Record<string, { done: number; total: number }>
  showPoints?: boolean
  epicAccent?: boolean
}): ReactNode {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const active = items.find((i) => i.id === activeId)

  const onDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id))
    document.body.classList.add('dragging-active')
  }

  const onDragEnd = (event: DragEndEvent): void => {
    document.body.classList.remove('dragging-active')
    setActiveId(null)
    const { active: a, over } = event
    if (!over) return
    const movedId = String(a.id)
    const overId = String(over.id)
    const column = statuses.find((s) => s.id === overId)
    const overItem = items.find((i) => i.id === overId)
    const targetStatus = column ? column.id : overItem?.statusId
    if (!targetStatus) return
    const ordered = reorderGlobal(items, movedId, column ? null : overId, targetStatus)
    const current = items.find((i) => i.id === movedId)
    if (!current) return
    const sameSpot = current.statusId === targetStatus &&
      ordered.join() === items.map((i) => i.id).join()
    if (sameSpot) return
    onMove(ordered, movedId, targetStatus)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); document.body.classList.remove('dragging-active') }}>
      <div className="flex h-full gap-3 overflow-x-auto pb-3">
        {statuses.map((status) => {
          const columnItems = items.filter((i) => i.statusId === status.id)
          return (
            <Column key={status.id} status={status} items={columnItems} showPoints={showPoints}
              onQuickAdd={onQuickAdd ? (title) => onQuickAdd(status.id, title) : undefined}>
              <SortableContext items={columnItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {columnItems.map((item) => (
                  <SortableCard
                    key={item.id}
                    item={item}
                    prefix={prefix}
                    epics={epics}
                    tags={tags}
                    taskCount={taskCounts?.[item.id]}
                    accent={epicAccent ? epics.find((e) => e.id === (item as Story).epicId)?.color : undefined}
                    onOpen={() => onOpen(item.id)}
                  />
                ))}
              </SortableContext>
            </Column>
          )
        })}
        {statuses.length === 0 && (
          <p className="p-6 text-[13px] text-faint">Este proyecto no tiene columnas para {kind}. Añádelas en Ajustes.</p>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(.2,0,0,1)' }}>
        {active && (
          <div className="w-72 rotate-2 cursor-grabbing rounded-xl border border-brand/50 bg-panel p-2.5 shadow-2xl shadow-black/60">
            <ItemCardBody item={active as unknown as CardItem} prefix={prefix} epics={epics} tags={tags} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
