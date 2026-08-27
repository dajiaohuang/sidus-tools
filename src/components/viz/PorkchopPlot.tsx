/**
 * Equirectangular-style heatmap of a porkchop grid: departure vs TOF, Δv as fill.
 * Pure presentational. Callers pass already-computed cells.
 */

import { useMemo } from 'react'
import { useElementSize } from './use-element-size'
import type { PorkchopCell } from '@/lib/physics'

const W = 640
const H = 360
const PAD = { l: 52, r: 12, t: 12, b: 36 }

type Props = {
  cells: PorkchopCell[]
  best?: PorkchopCell | null
  title: string
  xLabel: string
  yLabel: string
  className?: string
}

function isoDay(unixS: number): string {
  return new Date(unixS * 1000).toISOString().slice(0, 10)
}

export function PorkchopPlot({ cells, best, title, xLabel, yLabel, className = '' }: Props) {
  const { ref, ready } = useElementSize<HTMLDivElement>(1, 1)

  const grid = useMemo(() => {
    const deps = [...new Set(cells.map((c) => c.tDep))].sort((a, b) => a - b)
    const tofs = [...new Set(cells.map((c) => c.tof))].sort((a, b) => a - b)
    let dvMin = Infinity
    let dvMax = -Infinity
    for (const c of cells) {
      if (c.dvTot < dvMin) dvMin = c.dvTot
      if (c.dvTot > dvMax) dvMax = c.dvTot
    }
    const span = Math.max(dvMax - dvMin, 1e-9)
    const innerW = W - PAD.l - PAD.r
    const innerH = H - PAD.t - PAD.b
    const cw = deps.length ? innerW / deps.length : innerW
    const ch = tofs.length ? innerH / tofs.length : innerH
    const depIndex = new Map(deps.map((d, i) => [d, i]))
    const tofIndex = new Map(tofs.map((d, i) => [d, i]))
    const rects = cells.map((c) => {
      const i = depIndex.get(c.tDep) ?? 0
      const j = tofIndex.get(c.tof) ?? 0
      const t = (c.dvTot - dvMin) / span
      return {
        x: PAD.l + i * cw,
        y: PAD.t + (tofs.length - 1 - j) * ch,
        w: cw,
        h: ch,
        opacity: 0.18 + 0.82 * (1 - t),
        key: `${c.tDep}-${c.tof}`,
        best: best != null && c.tDep === best.tDep && c.tof === best.tof,
      }
    })
    const xTicks = deps.filter((_, i) => i === 0 || i === deps.length - 1 || i === Math.floor(deps.length / 2))
    const yTicks = tofs.filter((_, i) => i === 0 || i === tofs.length - 1 || i === Math.floor(tofs.length / 2))
    return { rects, cw, ch, deps, tofs, xTicks, yTicks }
  }, [best, cells])

  return (
    <div className={`flex h-full min-h-0 w-full flex-1 flex-col ${className}`}>
      <div ref={ref} className="relative min-h-0 w-full flex-1 bg-bg">
        {ready ? (
          <svg
            data-viz="porkchop"
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            className="absolute inset-0"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
          >
            <rect width={W} height={H} fill="var(--color-bg)" />
            {grid.rects.map((r) => (
              <rect
                key={r.key}
                x={r.x}
                y={r.y}
                width={Math.max(r.w, 0.5)}
                height={Math.max(r.h, 0.5)}
                fill="var(--color-signal)"
                fillOpacity={r.opacity}
                stroke={r.best ? 'var(--color-fg)' : 'none'}
                strokeWidth={r.best ? 1.5 : 0}
              />
            ))}
            {grid.xTicks.map((tDep) => {
              const i = grid.deps.indexOf(tDep)
              const x = PAD.l + (i + 0.5) * grid.cw
              return (
                <text
                  key={`x-${tDep}`}
                  x={x}
                  y={H - 10}
                  textAnchor="middle"
                  fill="var(--color-muted)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {isoDay(tDep)}
                </text>
              )
            })}
            {grid.yTicks.map((tof) => {
              const j = grid.tofs.indexOf(tof)
              const y = PAD.t + (grid.tofs.length - 1 - j + 0.5) * grid.ch
              return (
                <text
                  key={`y-${tof}`}
                  x={PAD.l - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {(tof / 86400).toFixed(0)}
                </text>
              )
            })}
            <text
              x={(PAD.l + W - PAD.r) / 2}
              y={H - 1}
              textAnchor="middle"
              fill="var(--color-subtle)"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {xLabel}
            </text>
            <text
              x={12}
              y={(PAD.t + H - PAD.b) / 2}
              textAnchor="middle"
              fill="var(--color-subtle)"
              fontSize="9"
              fontFamily="var(--font-mono)"
              transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}
            >
              {yLabel}
            </text>
          </svg>
        ) : null}
      </div>
    </div>
  )
}
