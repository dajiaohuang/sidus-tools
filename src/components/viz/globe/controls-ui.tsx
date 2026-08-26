/**
 * The globe's on-canvas control widgets and their shared dress: the
 * hold-to-repeat button, the trail appearance sliders, and the trajectory
 * hairline. Split from the map component because none of them touch the map:
 * they are plain controls that happen to float over one.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HairlineProgress } from '@/components/shared/HairlineProgress'
import { formatAu, formatKm, scaleBarFor, type ViewScale } from './scale'

const HOLD_REPEAT_DELAY_MS = 350
const HOLD_REPEAT_INTERVAL_MS = 120

/**
 * Whether a keydown landed on something the browser treats as text entry, so
 * a single-letter shortcut can tell "the user is typing S" from "the user
 * pressed S". Shared by every window-level shortcut on this view: GlobeMap's
 * camera keys and the tool's own search/panel keys all need the same guard,
 * and two copies of it are two chances for one to drift from the other.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

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
 * A control's keyboard shortcut, shown as a small card above it on hover or
 * focus.
 *
 * Every other label in these panels runs 9 to 10 px, small enough to stay out
 * of the way of the globe underneath them. A shortcut hint breaks that scale
 * on purpose: it has to be READ, not just noticed, since it is teaching a key
 * combination rather than confirming a state, and that is the one piece of
 * chrome here that earns the room.
 */
export function KeyTip({
  label,
  keys,
  children,
}: {
  label: string
  keys: readonly string[]
  children: ReactNode
}) {
  return (
    <div className="group/kbd relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap border border-border bg-bg-elevated px-2.5 py-1.5 opacity-0 shadow-lg transition-opacity delay-300 duration-150 group-hover/kbd:opacity-100 group-focus-within/kbd:opacity-100">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</span>
        {keys.map((key) => (
          <kbd
            key={key}
            className="ml-1.5 border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-xs font-semibold text-fg"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
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
  onCommit,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  /** Fires on pointer/key release so a URL write can wait until the gesture ends. */
  onCommit?: (next: number) => void
}) {
  const commit = (el: EventTarget | null) => {
    if (!(el instanceof HTMLInputElement) || !onCommit) return
    onCommit(Number(el.value))
  }
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-fg max-lg:gap-2 max-lg:py-1">
      <span className="w-20 text-muted max-lg:w-24">{label}</span>
      <input
        type="range"
        min={TRAIL_MULTIPLIER_MIN}
        max={TRAIL_MULTIPLIER_MAX}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => commit(e.currentTarget)}
        onPointerCancel={(e) => commit(e.currentTarget)}
        onKeyUp={(e) => commit(e.currentTarget)}
        className="h-1 w-24 cursor-pointer accent-warn max-lg:h-8 max-lg:min-w-0 max-lg:w-auto max-lg:flex-1"
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
 * WITHOUT taking the picture away. It leaves entirely once there is nothing
 * left to wait for, so a settled view carries no residue of having loaded.
 */
export function TrailProgress({ value }: { value: number | null }) {
  const { t } = useTranslation()
  if (value === null || value >= 1) return null
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <HairlineProgress
      value={value}
      label={t('fields.globe_trail_progress', { percent })}
    />
  )
}

/** Range of the trail appearance multipliers, either side of the tier baseline. */
const TRAIL_MULTIPLIER_MIN = 0.25
const TRAIL_MULTIPLIER_MAX = 4

/**
 * Zoom number, a real map scale (drawn width = named length), and the view
 * width in au. One readout, used as a floating HUD on desktop/tablet and
 * inside VIEW on the phone.
 */
export function GlobeScaleReadout({
  zoom,
  scale,
}: {
  zoom: number
  scale: ViewScale
}) {
  const { t } = useTranslation()
  const bar = scaleBarFor(scale.metresPerPixel)
  return (
    <div
      className="flex flex-col gap-0.5 font-mono text-[10px] leading-tight text-muted"
      title={t('fields.globe_scale_hint')}
    >
      <div className="flex w-full justify-between gap-2">
        <span>{t('fields.globe_zoom')}</span>
        <span className="tabular-nums text-subtle">{zoom.toFixed(2)}</span>
      </div>
      {bar ? (
        <div className="flex items-baseline gap-1.5">
          <span
            className="h-[5px] shrink-0 border-b border-l border-r border-subtle"
            style={{ width: `${bar.widthPx}px` }}
            aria-hidden
          />
          <span className="tabular-nums text-subtle">{formatKm(bar.metres)}</span>
        </div>
      ) : null}
      <span className="tabular-nums">
        {t('fields.globe_view_width')} {formatAu(scale.viewWidthAu)}
      </span>
    </div>
  )
}

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

