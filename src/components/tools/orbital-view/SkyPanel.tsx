import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SKY_BODY_IDS, type SkyBodyId } from '@/components/viz/globe/celestial'

/**
 * The globe's list of sky bodies: a visibility box and an aim affordance each.
 *
 * The checkbox and the name do different jobs on purpose: the box decides
 * whether the body is drawn at all, the name points the camera at it, so they
 * are two controls rather than one row that has to mean both.
 *
 * `highlighted` is the body the pointer is on OUT ON THE GLOBE, marked the same
 * way the satellite list marks the one it is identifying, so a path and its row
 * are visibly the same thing whichever end the pointer is at.
 */
export function SkyPanel({
  enabled,
  onEnabledChange,
  onAim,
  highlighted,
}: {
  enabled: SkyBodyId[]
  onEnabledChange: (next: SkyBodyId[]) => void
  onAim: (id: SkyBodyId) => void
  highlighted?: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1 border border-border bg-bg/80 px-2 py-1.5 backdrop-blur-sm">
      {/* Same header shape as the satellite list: the title, then the two bulk
          actions. Nine checkboxes is exactly the count where clicking them one
          at a time starts to feel like work. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {t('fields.globe_sky_bodies')}
        </p>
        {/* ONE action, never two: with nothing ticked the only useful move is to
            show them, and with anything ticked it is to clear them. A pair of
            buttons where one is always dead is a pair that has to be read
            before it can be used. */}
        {enabled.length === 0 ? (
          <button
            type="button"
            onClick={() => onEnabledChange([...SKY_BODY_IDS])}
            className="font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-fg"
          >
            {t('fields.globe_sky_show_all')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onEnabledChange([])}
            className="font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-warn"
          >
            {t('fields.sat_remove_all')}
          </button>
        )}
      </div>
      {SKY_BODY_IDS.map((id) => (
        <div
          key={id}
          data-identified={id === highlighted ? '' : undefined}
          className={cn(
            'flex items-center gap-1.5 px-1 font-mono text-[10px] transition-colors',
            id === highlighted && 'bg-warn/15',
          )}
        >
          <input
            type="checkbox"
            aria-label={t(`fields.body_${id}`)}
            checked={enabled.includes(id)}
            onChange={(e) =>
              onEnabledChange(
                e.target.checked
                  ? SKY_BODY_IDS.filter((other) => other === id || enabled.includes(other))
                  : enabled.filter((other) => other !== id),
              )
            }
            className="cursor-pointer accent-warn"
          />
          <button
            type="button"
            onClick={() => onAim(id)}
            className={cn(
              'cursor-pointer underline-offset-2 transition-colors hover:text-warn hover:underline',
              id === highlighted ? 'text-warn' : 'text-subtle',
            )}
          >
            {t(`fields.body_${id}`)}
          </button>
        </div>
      ))}
    </div>
  )
}
