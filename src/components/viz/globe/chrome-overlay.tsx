import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { CTRL_PANEL_CLASS, CTRL_PANEL_TITLE_CLASS } from './controls-ui'

export type OrbitalChromeSheet = 'sats' | 'sky' | 'camera' | 'view' | 'trails' | 'bodies'

/**
 * Bottom sheet over the globe: no dimmed backdrop, so the planet stays
 * visible. Hug-content by default; `fullHeight` stretches to the dock.
 */
export function ChromeSheet({
  open,
  title,
  onClose,
  children,
  fullHeight = false,
  bodyClassName,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  fullHeight?: boolean
  bodyClassName?: string
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        'pointer-events-auto fixed z-40 flex flex-col overflow-hidden border border-border-strong bg-bg-elevated/98 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]',
        fullHeight
          ? 'top-[max(0.75rem,var(--safe-top))]'
          : 'max-h-[min(70dvh,calc(100dvh-6.5rem))]',
      )}
      style={{
        left: 'max(0.75rem, var(--safe-left))',
        right: 'max(0.75rem, var(--safe-right))',
        bottom: 'calc(4.25rem + var(--safe-bottom))',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg">{title}</h2>
        <button
          type="button"
          aria-label={t('fields.chrome_close')}
          className="flex h-8 w-8 items-center justify-center font-mono text-base leading-none text-muted transition-colors hover:text-warn"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div
        className={cn(
          'flex min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3',
          fullHeight ? 'flex-1 overflow-hidden' : 'flex-[0_1_auto]',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Desktop: the stacked floating column. Compact: a fragment of sheets. */
export function ChromeHost({
  compact,
  children,
}: {
  compact: boolean
  children: ReactNode
}) {
  if (compact) return <>{children}</>
  return (
    <div className="absolute bottom-4 right-4 z-[2] flex flex-col items-end gap-2">{children}</div>
  )
}

/** Desktop: titled card. Compact: bottom sheet when `open`. */
export function ChromePanel({
  compact,
  open,
  title,
  onClose,
  children,
  bodyClassName,
}: {
  compact: boolean
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  bodyClassName?: string
}) {
  if (compact) {
    return (
      <ChromeSheet open={open} title={title} onClose={onClose} bodyClassName={bodyClassName}>
        {children}
      </ChromeSheet>
    )
  }
  return (
    <div className={CTRL_PANEL_CLASS}>
      <p className={CTRL_PANEL_TITLE_CLASS}>{title}</p>
      {children}
    </div>
  )
}

/** Full-width on compact chrome; dismissible. Pointer-events on the card only. */
export function ViewAlert({
  children,
  tone = 'muted',
  onDismiss,
}: {
  children: ReactNode
  tone?: 'muted' | 'warn'
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2 border px-3 py-2 font-mono text-[10px] leading-relaxed',
        tone === 'warn'
          ? 'border-warn/40 bg-warn/10 text-warn'
          : 'border-border bg-surface/90 text-muted',
      )}
    >
      <p className="min-w-0 flex-1">{children}</p>
      <button
        type="button"
        aria-label={t('fields.globe_error_dismiss')}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-base leading-none text-muted transition-colors hover:text-warn"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}

export function ChromeDock({
  items,
  active,
  onSelect,
}: {
  items: { id: OrbitalChromeSheet; label: string }[]
  active: OrbitalChromeSheet | null
  onSelect: (id: OrbitalChromeSheet) => void
}) {
  return (
    <nav
      className="pointer-events-auto fixed z-50 flex border border-border-strong bg-bg/95"
      style={{
        left: 'max(0.75rem, var(--safe-left))',
        right: 'max(0.75rem, var(--safe-right))',
        bottom: 'max(0.75rem, var(--safe-bottom))',
      }}
      role="toolbar"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={active === item.id}
          onClick={() => onSelect(item.id)}
          className={cn(
            'flex min-h-12 min-w-0 flex-1 items-center justify-center px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-fg',
            active === item.id && 'bg-warn/15 text-warn',
          )}
        >
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
