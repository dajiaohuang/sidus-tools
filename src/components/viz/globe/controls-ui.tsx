/**
 * The globe's on-canvas control widgets and their shared dress: the
 * hold-to-repeat button, the trail appearance sliders, and the convergence
 * hairline. Split from the map component because none of them touch the map:
 * they are plain controls that happen to float over one.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const HOLD_REPEAT_DELAY_MS = 350
const HOLD_REPEAT_INTERVAL_MS = 120

/** Hold-to-repeat control: fires once on press, then repeats until release. */
export function HoldButton({
  onTrigger,
  title,
  className,
  children,
}: {
  onTrigger: () => void
  title: string
  className?: string
  children: ReactNode
}) {
  const timeoutRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => stop, [stop])

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={className}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        onTrigger()
        timeoutRef.current = window.setTimeout(() => {
          intervalRef.current = window.setInterval(onTrigger, HOLD_REPEAT_INTERVAL_MS)
        }, HOLD_REPEAT_DELAY_MS)
      }}
      onPointerUp={(e) => {
        stop()
        e.currentTarget.blur()
      }}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  )
}

/**
 * One multiplier in the trail appearance control.
 *
 * The range is a multiplier on the tier baseline rather than an absolute
 * width or alpha: the baselines are what make ten thousand trails legible at
 * all, and an absolute control would let the view be set to a value that is
 * simply wrong for the population currently on it.
 */
export function TrailSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-fg">
      <span className="w-20 text-muted">{label}</span>
      <input
        type="range"
        min={TRAIL_MULTIPLIER_MIN}
        max={TRAIL_MULTIPLIER_MAX}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-24 cursor-pointer accent-warn"
      />
      <span className="w-8 text-right tabular-nums text-subtle">{value.toFixed(2)}</span>
    </label>
  )
}

/**
 * Convergence of the population's trails, as a hairline under the sliders.
 *
 * Ten thousand trails take about a minute to arrive, and for that minute a
 * correct view is indistinguishable from a stalled one. This says which it is
 * WITHOUT taking the picture away: a two-pixel rule and a percentage inside a
 * panel the viewer already has open, never an overlay on the globe. It leaves
 * entirely once there is nothing left to wait for, so a settled view carries
 * no residue of having loaded.
 */
export function TrailProgress({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null || value >= 1) return null
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      className="flex items-center gap-1.5 font-mono text-[10px] text-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={t('fields.globe_trail_progress', { percent })}
    >
      <span className="h-[2px] flex-1 overflow-hidden rounded-full bg-fg/15">
        <span
          className="block h-full rounded-full bg-warn/70 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="tabular-nums">{percent}%</span>
    </div>
  )
}

/** Range of the trail appearance multipliers, either side of the tier baseline. */
const TRAIL_MULTIPLIER_MIN = 0.25
const TRAIL_MULTIPLIER_MAX = 4

export const CTRL_GROUP_CLASS = 'flex gap-[3px] rounded-md border border-border bg-surface/80 p-1'
/** A titled group of related controls, for the ones that need saying out loud. */
export const CTRL_PANEL_CLASS =
  'flex flex-col gap-1.5 rounded-md border border-border bg-surface/80 p-1.5'
export const CTRL_PANEL_TITLE_CLASS =
  'font-mono text-[10px] uppercase tracking-[0.12em] text-muted'
export const CTRL_BTN_CLASS =
  'flex h-7 w-7 items-center justify-center rounded border border-border bg-fg/[0.03] font-mono text-[13px] leading-none text-fg transition-colors hover:border-warn active:bg-warn/25'
export const CTRL_BTN_WIDE_CLASS =
  'flex h-7 items-center justify-center rounded border border-border bg-fg/[0.03] px-2.5 font-mono text-[11px] leading-none text-fg transition-colors hover:border-warn active:bg-warn/25'

