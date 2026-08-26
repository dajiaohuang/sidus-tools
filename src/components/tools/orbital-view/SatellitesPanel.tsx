import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CELESTRAK_CATALOG_URL,
  CELESTRAK_GROUPS,
  groupCacheIsFresh,
  queryCacheIsFresh,
  type CelestrakGroupId,
  type TleRecord,
} from '@/lib/celestrak'
import { satelliteColorAt } from '@/components/viz/globe/style'
import { HairlineProgress } from '@/components/shared/HairlineProgress'
import { KeyTip } from '@/components/viz/globe/controls-ui'
import { cn } from '@/lib/utils'
import { TIER_FILTER_MIN, TIER_NAMED_MAX, TIER_TRAILS_MAX, type SwarmScaleTier } from './tiers'
import type { SelectedSatellite } from './types'

/**
 * The globe's satellites panel: catalogue search, the selection, and the group
 * chips. Thin by construction: every decision it shows was made in the tool,
 * and everything here is either display or a callback back into it.
 */
export function SatellitesPanel({
  searchInputRef,
  query,
  onQueryChange,
  onSearch,
  fetchingTle,
  results,
  addSatellite,
  selected,
  visibleSelected,
  selectedFilter,
  onFilterChange,
  refreshSelected,
  removeAll,
  removeSatellite,
  followTargetId,
  setFollowTargetId,
  setHoveredSatelliteId,
  listRef,
  identifiedSatelliteId,
  onPin,
  onListScroll,
  listWindow,
  paletteIndexOf,
  tier,
  activeGroups,
  loadingGroup,
  groupProgress,
  toggleGroup,
  swarmStatus,
  fetchError,
  fetchNotice,
  framed = true,
}: {
  /** The catalogue search input, focused and selected by the F shortcut. */
  searchInputRef: React.RefObject<HTMLInputElement | null>
  query: string
  onQueryChange: (next: string) => void
  onSearch: () => void
  fetchingTle: boolean
  results: TleRecord[] | null
  addSatellite: (record: TleRecord) => void
  selected: SelectedSatellite[]
  visibleSelected: SelectedSatellite[]
  selectedFilter: string
  onFilterChange: (next: string) => void
  refreshSelected: () => void
  removeAll: () => void
  removeSatellite: (catnr: string) => void
  followTargetId: string
  setFollowTargetId: (catnr: string) => void
  setHoveredSatelliteId: (catnr: string | null) => void
  listRef: React.RefObject<HTMLDivElement | null>
  /** The satellite the globe is identifying: its row highlights and scrolls in. */
  identifiedSatelliteId: string | null
  /** Pin from the list, the same action a click on the globe performs. */
  onPin: (catnr: string) => void
  onListScroll: (top: number, height: number) => void
  listWindow: { rows: SelectedSatellite[]; padTop: number; padBottom: number }
  paletteIndexOf: Map<string, number>
  tier: SwarmScaleTier
  activeGroups: CelestrakGroupId[]
  loadingGroup: CelestrakGroupId | null
  groupProgress: number | null
  toggleGroup: (group: CelestrakGroupId) => void
  swarmStatus: { loading: boolean; count: number; rejected: number; skipped: number }
  fetchError?: string
  fetchNotice?: string
  /** False inside a chrome sheet: the sheet already titles the panel. */
  framed?: boolean
}) {
  const { t } = useTranslation()
  const searchBoxRef = useRef<HTMLDivElement | null>(null)
  const [resultsOpen, setResultsOpen] = useState(false)
  useEffect(() => {
    if (results && results.length > 0) setResultsOpen(true)
  }, [results])
  useEffect(() => {
    if (!resultsOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (searchBoxRef.current?.contains(event.target as Node)) return
      setResultsOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [resultsOpen])
  const cacheFresh =
    selected.length > 0 &&
    selected.every((entry) =>
      entry.group ? groupCacheIsFresh(entry.group) : queryCacheIsFresh(entry.catnr),
    )
  return (
      <div
        className={cn(
          'flex min-h-0 flex-col',
          framed
            ? 'w-64 gap-1.5 overflow-x-hidden border border-border bg-bg/85 px-2 py-2 backdrop-blur-sm'
            : 'h-full min-h-0 w-full gap-3 overflow-x-hidden',
        )}
      >
        {framed ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {t('fields.sat_panel')}
          </p>
        ) : null}

        <div ref={searchBoxRef} className="relative">
          <form
            className={cn('flex items-center gap-1', !framed && 'gap-2')}
            onSubmit={(e) => {
              e.preventDefault()
              onSearch()
            }}
          >
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => {
                if (results && results.length > 0) setResultsOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setResultsOpen(false)
                  e.currentTarget.blur()
                }
              }}
              placeholder={t('fields.sat_search_placeholder')}
              aria-label={t('fields.sat_search_placeholder')}
              aria-expanded={resultsOpen}
              aria-controls="sat-search-results"
              className={cn(
                'h-7 min-w-0 flex-1 border border-border bg-surface/70 px-1.5 font-mono text-[10px] text-fg placeholder:text-muted focus:border-border-strong focus:outline-none',
                !framed && 'h-10 px-2 text-[12px]',
              )}
            />
            {/* The KeyTip lands on the submit button rather than the input: the
                input needs its own flex-1 growth to fill the row, and KeyTip's
                wrapper would shrink-wrap it down to nothing. */}
            <KeyTip label={t('fields.kbd_search')} keys={['F']}>
              <button
                type="submit"
                disabled={fetchingTle || query.trim() === ''}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center border border-border-strong bg-surface/80 px-2 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50',
                  !framed && 'h-10 px-3',
                )}
              >
                {fetchingTle ? t('fields.fetching') : t('fields.sat_search')}
              </button>
            </KeyTip>
          </form>
          {resultsOpen && results && results.length > 0 ? (
            <div
              id="sat-search-results"
              role="listbox"
              className="absolute inset-x-0 top-full z-30 mt-0.5 max-h-40 overflow-y-auto border border-border-strong bg-bg-elevated shadow-lg"
            >
              {results.map((record) => {
                const already = selected.some((entry) => entry.catnr === record.catnr)
                return (
                  <button
                    key={record.catnr}
                    type="button"
                    role="option"
                    aria-selected={already}
                    disabled={already}
                    onClick={() => {
                      addSatellite(record)
                      setResultsOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 px-1.5 py-1.5 text-left font-mono text-[10px] text-subtle transition-colors hover:bg-surface/70 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="truncate">{record.name}</span>
                    <span className="shrink-0 tabular text-muted">
                      {already ? '·' : `+ ${record.catnr}`}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {t('fields.sat_selected', { count: selected.length })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshSelected()}
              disabled={fetchingTle || selected.length === 0 || cacheFresh}
              title={cacheFresh ? t('fields.sat_refresh_fresh') : t('fields.sat_refresh')}
              className="font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('fields.sat_refresh')}
            </button>
            <button
              type="button"
              onClick={removeAll}
              disabled={selected.length === 0}
              className="font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-warn disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('fields.sat_remove_all')}
            </button>
          </div>
        </div>

        {/* Filters what is already selected. The field above searches the catalogue. */}
        {selected.length > TIER_FILTER_MIN ? (
          <input
            type="search"
            value={selectedFilter}
            onChange={(e) => {
              onFilterChange(e.target.value)
              /* A new filter is a new list: keep the window at the top
                 rather than pointing past the end of a shorter result. */
              if (listRef.current) listRef.current.scrollTop = 0
            }}
            placeholder={t('fields.sat_filter_placeholder')}
            aria-label={t('fields.sat_filter_placeholder')}
            className={cn(
              'h-6 w-full border border-border bg-surface/60 px-1.5 font-mono text-[10px] text-fg placeholder:text-muted focus:border-border-strong focus:outline-none',
              !framed && 'h-10 px-2 text-[12px]',
            )}
          />
        ) : null}

        <div
          ref={listRef}
          onScroll={(e) => onListScroll(e.currentTarget.scrollTop, e.currentTarget.clientHeight)}
          /* min-h-0 is the piece that lets a flex child actually SHRINK: the
             column's max-height squeezes this list and only this list, so a
             fleet scrolls in here while everything around it stays fixed. The
             old 40vh cap made the list scroll even when the screen had room
             to spare. */
          className={cn('min-h-0 overflow-y-auto', !framed && 'flex-1')}
        >
          {listWindow.padTop > 0 ? <div style={{ height: listWindow.padTop }} /> : null}
          {listWindow.rows.map((entry) => {
            const index = paletteIndexOf.get(entry.catnr) ?? -1
            return (
              <div
                key={entry.catnr}
                data-sat-row
                data-identified={entry.catnr === identifiedSatelliteId ? '' : undefined}
                className={cn(
                  'flex items-center gap-1.5 py-0.5',
                  entry.catnr === identifiedSatelliteId && 'bg-warn/15',
                )}
                onPointerEnter={() => setHoveredSatelliteId(entry.catnr)}
                onPointerLeave={() => setHoveredSatelliteId(null)}
                /* Clicking the row pins the same way clicking its dot does, so
                   the list and the globe are two views of one selection. */
                onClick={() => onPin(entry.catnr)}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: satelliteColorAt(index < 0 ? 0 : index) }}
                />
                <button
                  type="button"
                  onClick={() => setFollowTargetId(entry.catnr)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left font-mono text-[10px] transition-colors hover:text-warn',
                    entry.catnr === followTargetId ? 'text-warn' : 'text-subtle',
                  )}
                  title={t('fields.sat_follow_target')}
                >
                  {entry.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeSatellite(entry.catnr)}
                  aria-label={t('fields.sat_remove')}
                  title={t('fields.sat_remove')}
                  className="shrink-0 px-1 font-mono text-[10px] text-muted transition-colors hover:text-warn"
                >
                  ×
                </button>
              </div>
            )
          })}
          {listWindow.padBottom > 0 ? <div style={{ height: listWindow.padBottom }} /> : null}
          {visibleSelected.length === 0 && selected.length > 0 ? (
            <p className="py-1 font-mono text-[10px] text-muted">
              {t('fields.sat_filter_none')}
            </p>
          ) : null}
        </div>

        {/* Desktop overlay only: the sheet has no room for this copy. */}
        {framed && tier !== 'named' ? (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] leading-relaxed text-muted">
              {tier === 'trails'
                ? t('fields.sat_tier_trails', { max: TIER_NAMED_MAX })
                : t('fields.sat_tier_dots', { max: TIER_TRAILS_MAX })}
            </p>
            {tier === 'dots' ? (
              <p className="font-mono text-[10px] leading-relaxed text-muted">
                {t('fields.sat_tier_dots_trails')}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Group presets: the mass path, a whole catalogue group at once. */}
        <div
          className={cn(
            'flex flex-col gap-1 border-t border-border/60 pt-1.5',
            !framed && 'gap-2 pt-3',
          )}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {t('fields.sat_groups')}
          </p>
          <div className={cn('flex flex-wrap gap-1', !framed && 'gap-2')}>
            {(Object.keys(CELESTRAK_GROUPS) as CelestrakGroupId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeGroups.includes(id)}
                aria-busy={loadingGroup === id}
                disabled={loadingGroup !== null}
                onClick={() => toggleGroup(id)}
                className={cn(
                  'border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-fg',
                  !framed && 'min-h-10 px-2.5 py-2',
                  activeGroups.includes(id) && 'border-warn text-warn',
                  /* The chip being downloaded stays lit while the rest dim. */
                  loadingGroup === id ? 'border-fg text-fg' : 'disabled:opacity-50',
                )}
              >
                {t(`fields.sat_group_${id}`)}
              </button>
            ))}
          </div>
          {fetchError ? (
            <p className="font-mono text-[10px] leading-relaxed text-warn">{fetchError}</p>
          ) : null}
          {fetchNotice ? (
            <p className="font-mono text-[10px] leading-relaxed text-muted">{fetchNotice}</p>
          ) : null}
          {loadingGroup !== null ? (
            <HairlineProgress
              value={groupProgress}
              label={
                groupProgress === null
                  ? t('fields.fetching')
                  : t('fields.sat_group_progress', {
                      percent: Math.round(groupProgress * 100),
                    })
              }
            />
          ) : swarmStatus.loading ? (
            <HairlineProgress value={null} label={t('fields.fetching')} />
          ) : tier === 'dots' ? (
            <p className="font-mono text-[10px] text-subtle">
              {t('fields.sat_group_count', { count: swarmStatus.count })}
            </p>
          ) : null}
          {/* A real catalogue carries objects that will not parse or propagate.
              Saying so beats a count that quietly disagrees with the sky. */}
          {tier === 'dots' && !swarmStatus.loading && swarmStatus.rejected + swarmStatus.skipped > 0 ? (
            <p className="font-mono text-[10px] leading-relaxed text-muted">
              {t('fields.sat_group_unusable', {
                rejected: swarmStatus.rejected,
                skipped: swarmStatus.skipped,
              })}
            </p>
          ) : null}
        </div>

        <a
          href={CELESTRAK_CATALOG_URL}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
        >
          {t('fields.browse_celestrak')}
        </a>
      </div>
  )
}
