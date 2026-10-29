import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type { BurndownPoint } from '../../../shared/types'

/** Gráfica burndown dibujada a mano en SVG: sin dependencias extra. */
export function Burndown({ sprintId, height = 180 }: { sprintId: string; height?: number }): ReactNode {
  const [points, setPoints] = useState<BurndownPoint[]>([])

  useEffect(() => {
    let alive = true
    api.burndown(sprintId).then((p) => { if (alive) setPoints(p) })
    return () => { alive = false }
  }, [sprintId])

  if (points.length < 2) {
    return (
      <p className="flex h-full items-center justify-center text-[12px] text-faint">
        Define fechas de inicio y fin en el sprint para ver la gráfica.
      </p>
    )
  }

  const W = 640
  const H = height
  const padL = 30
  const padB = 20
  const padT = 10
  const max = Math.max(1, ...points.map((p) => Math.max(p.ideal, Number.isNaN(p.remaining) ? 0 : p.remaining)))
  const x = (i: number): number => padL + (i * (W - padL - 8)) / (points.length - 1)
  const y = (v: number): number => padT + (1 - v / max) * (H - padT - padB)

  const real = points.filter((p) => !Number.isNaN(p.remaining))
  const line = (pts: Array<[number, number]>): string => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
  const idealPts = points.map((p, i) => [x(i), y(p.ideal)] as [number, number])
  const realPts = real.map((p, i) => [x(i), y(p.remaining)] as [number, number])
  const area = realPts.length > 1
    ? `${line(realPts)} L${realPts[realPts.length - 1][0]},${y(0)} L${realPts[0][0]},${y(0)} Z`
    : ''

  const ticks = [0, max / 2, max]
  const todayIdx = real.length - 1
  const behind = real.length > 0 && real[todayIdx].remaining > points[todayIdx].ideal

  return (
    <div className="h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#282d39" strokeWidth={1} />
            <text x={4} y={y(t) + 3.5} fill="#6b7385" fontSize={9} fontFamily="ui-monospace, monospace">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={line(idealPts)} fill="none" stroke="#4b5366" strokeWidth={1.5} strokeDasharray="4 4" />
        {area && <path d={area} fill={behind ? 'rgba(239,68,68,.12)' : 'rgba(99,102,241,.14)'} />}
        {realPts.length > 1 && (
          <path d={line(realPts)} fill="none" stroke={behind ? '#ef4444' : '#6366f1'} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />
        )}
        {realPts.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i === realPts.length - 1 ? 3.5 : 2}
            fill={behind ? '#ef4444' : '#6366f1'} />
        ))}
        <text x={padL} y={H - 6} fill="#6b7385" fontSize={9}>{points[0].date.slice(5)}</text>
        <text x={W - 8} y={H - 6} fill="#6b7385" fontSize={9} textAnchor="end">
          {points[points.length - 1].date.slice(5)}
        </text>
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: behind ? '#ef4444' : '#6366f1' }} /> real
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed border-[#4b5366]" /> ideal
        </span>
      </div>
    </div>
  )
}
