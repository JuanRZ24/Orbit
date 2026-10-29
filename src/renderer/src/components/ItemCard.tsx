import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, CalendarClock, MessageSquare, ListChecks } from 'lucide-react'
import type { Epic, Issue, Story, Tag, Task } from '../../../shared/types'
import {
  cn, PRIORITY_COLOR, ISSUE_TYPE_COLOR, ISSUE_TYPE_LABEL, alpha, dueTone, formatDate,
  pointsLabel, refLabel, tagColor
} from '../lib/ui'
import { TagChip } from './TagInput'

export interface CardItem {
  id: string
  ref: number
  title: string
  tags: string[]
  priority: string
  blocked: 0 | 1
  dueDate: string | null
  points?: number | null
  epicId?: string | null
  type?: string
}

export function ItemCardBody({ item, prefix, epics, tags, taskCount, commentCount, compact }: {
  item: CardItem
  prefix: string
  epics: Epic[]
  tags: Tag[]
  taskCount?: { done: number; total: number }
  commentCount?: number
  compact?: boolean
}): ReactNode {
  const epic = item.epicId ? epics.find((e) => e.id === item.epicId) : undefined
  const tone = dueTone(item.dueDate)

  return (
    <>
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-px font-mono text-[11px] text-faint">{refLabel(prefix, item.ref)}</span>
        <p className={cn('flex-1 text-[13px] leading-snug', item.blocked && 'text-dim line-through decoration-red-500/60')}>
          {item.title}
        </p>
        {item.points !== undefined && (
          <span className="shrink-0 rounded-md bg-app px-1.5 py-0.5 font-mono text-[11px] text-dim" title="Puntos">
            {pointsLabel(item.points)}
          </span>
        )}
      </div>

      {!compact && (epic || item.tags.length > 0 || item.type) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {epic && (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: alpha(epic.color, 18), color: epic.color, border: `1px solid ${alpha(epic.color, 32)}` }}>
              {epic.title}
            </span>
          )}
          {item.type && (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                background: alpha(ISSUE_TYPE_COLOR[item.type as keyof typeof ISSUE_TYPE_COLOR], 18),
                color: ISSUE_TYPE_COLOR[item.type as keyof typeof ISSUE_TYPE_COLOR]
              }}>
              {ISSUE_TYPE_LABEL[item.type as keyof typeof ISSUE_TYPE_LABEL]}
            </span>
          )}
          {item.tags.slice(0, 4).map((t) => <TagChip key={t} name={t} color={tagColor(tags, t)} />)}
          {item.tags.length > 4 && <span className="text-[11px] text-faint">+{item.tags.length - 4}</span>}
        </div>
      )}

      {(item.blocked || tone !== 'none' || taskCount?.total || commentCount || item.priority !== 'normal') && (
        <div className="mt-2 flex items-center gap-2.5 text-[11px] text-faint">
          {item.priority !== 'normal' && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full"
                style={{ background: PRIORITY_COLOR[item.priority as keyof typeof PRIORITY_COLOR] }} />
            </span>
          )}
          {item.blocked === 1 && <Ban size={12} className="text-red-400" />}
          {taskCount && taskCount.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks size={12} />{taskCount.done}/{taskCount.total}
            </span>
          )}
          {commentCount ? <span className="inline-flex items-center gap-1"><MessageSquare size={12} />{commentCount}</span> : null}
          {item.dueDate && (
            <span className={cn('inline-flex items-center gap-1',
              tone === 'late' && 'text-red-400', tone === 'soon' && 'text-amber-400')}>
              <CalendarClock size={12} />{formatDate(item.dueDate)}
            </span>
          )}
        </div>
      )}
    </>
  )
}

export function SortableCard({ item, prefix, epics, tags, onOpen, taskCount, accent }: {
  item: Story | Task | Issue
  prefix: string
  epics: Epic[]
  tags: Tag[]
  onOpen: () => void
  taskCount?: { done: number; total: number }
  accent?: string
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const card = item as unknown as CardItem

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        'group relative cursor-grab rounded-xl border border-line bg-panel p-2.5 text-left',
        'transition-colors hover:border-faint/60 active:cursor-grabbing'
      )}
    >
      {accent && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full" style={{ background: accent }} />}
      <ItemCardBody item={card} prefix={prefix} epics={epics} tags={tags} taskCount={taskCount} />
    </div>
  )
}
