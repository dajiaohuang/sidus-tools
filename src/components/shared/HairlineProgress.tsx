import { cn } from '@/lib/utils'

/**
 * Two-pixel progress hairline. The parent unmounts it when the wait is over.
 * `null` means the fraction is not known yet: the fill pulses, the figure is
 * an ellipsis.
 */
export function HairlineProgress({
  value,
  label,
  className,
}: {
  /** Fraction in [0, 1], or null while the fraction is not yet known. */
  value: number | null
  /** Accessible name, already translated. */
  label: string
  className?: string
}) {
  const indeterminate = value === null
  const percent = indeterminate ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      className={cn('flex items-center gap-1.5 font-mono text-[10px] text-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
      aria-label={label}
    >
      <span className="h-[2px] flex-1 overflow-hidden rounded-full bg-fg/15">
        <span
          className={cn(
            'block h-full rounded-full bg-warn/70',
            indeterminate
              ? 'w-1/3 animate-pulse'
              : 'transition-[width] duration-300 ease-out',
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </span>
      <span className="tabular-nums">{indeterminate ? '…' : `${percent}%`}</span>
    </div>
  )
}
