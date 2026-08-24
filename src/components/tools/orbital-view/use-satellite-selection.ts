/**
 * The selection: which satellites are on the view, where their element sets
 * come from, and how the URL carries it all.
 *
 * One population. A group chip is a way of putting many satellites into it at
 * once, not a second list that lives somewhere else; a search adds one at a
 * time. The CelesTrak module owns the network etiquette (two-hour cache, in
 * memory and localStorage), so repeats and reloads cost no request.
 *
 * The URL carries IDENTITIES, never element sets, and a group as a MEMBERSHIP
 * rather than its members: `groups=starlink` instead of ten thousand catalogue
 * numbers, which is the difference between a shareable link and one no browser
 * will accept.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CELESTRAK_GROUPS,
  fetchCelestrakGroup,
  searchCelestrak,
  tleText,
  type CelestrakGroupId,
  type TleRecord,
} from '@/lib/celestrak'
import { SAMPLE_ISS_TLE } from '@/lib/physics'
import type { SelectedSatellite } from './types'
import type { TooltipTranslate } from './tooltips'

/** The satellite this view has always opened on. */
export const ISS_CATNR_TEXT = '25544'

/**
 * Empty selection, spelled out. An empty `sats=` reads as absent and falls
 * back to the ISS, so "the groups are the whole selection" needs a token of
 * its own to survive a reload or a shared link.
 */
export const SATS_NONE = 'none'

export type SatelliteSelection = {
  selected: SelectedSatellite[]
  activeGroups: CelestrakGroupId[]
  loadingGroup: CelestrakGroupId | null
  groupProgress: number | null
  selectedFilter: string
  setSelectedFilter: (next: string) => void
  followTargetId: string
  setFollowTargetId: (catnr: string) => void
  fetchingTle: boolean
  tleFetchError: string
  tleNotice: string
  query: string
  setQuery: (next: string) => void
  results: TleRecord[] | null
  runSearch: () => Promise<void>
  addSatellite: (record: TleRecord) => void
  removeSatellite: (catnr: string) => void
  removeAll: () => void
  toggleGroup: (group: CelestrakGroupId) => Promise<void>
  refreshSelected: () => Promise<void>
}

export function useSatelliteSelection(options: {
  onGlobe: boolean
  /** The URL's `sats` and `groups` params, and the writer that syncs them. */
  sats: string
  groups: string
  syncUrl: (next: { sats: string; groups: string }) => void
  t: TooltipTranslate
}): SatelliteSelection {
  const { onGlobe, sats, groups, syncUrl, t } = options

  /**
   * The selected satellites, in selection order: the order fixes each one's
   * colour, so removing the third does not recolour the fourth.
   */
  const [selected, setSelected] = useState<SelectedSatellite[]>(() => [
    { catnr: ISS_CATNR_TEXT, name: 'ISS (ZARYA)', tle: SAMPLE_ISS_TLE, source: 'search' },
  ])
  /** Groups whose whole membership is currently in the list. */
  const [activeGroups, setActiveGroups] = useState<CelestrakGroupId[]>([])
  /** The group being downloaded, and how far in, so its chip can say so. */
  const [loadingGroup, setLoadingGroup] = useState<CelestrakGroupId | null>(null)
  const [groupProgress, setGroupProgress] = useState<number | null>(null)
  /** Filters the SELECTED list; nothing to do with the catalogue search. */
  const [selectedFilter, setSelectedFilter] = useState('')
  const [followTargetId, setFollowTargetId] = useState<string>(ISS_CATNR_TEXT)
  const [fetchingTle, setFetchingTle] = useState(false)
  const [tleFetchError, setTleFetchError] = useState('')
  /**
   * A notice is not an error. "The stored copy is in use" is the fetch working
   * as designed, and it was only sharing the error variable because the banner
   * happened to be the nearest place to put it.
   */
  const [tleNotice, setTleNotice] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TleRecord[] | null>(null)

  /** Keeps the mount fetch to one request even when effects run twice in dev. */
  const autoFetchedRef = useRef(false)
  /** The live selection, for callbacks that must not re-create on every change. */
  const selectedRef = useRef<SelectedSatellite[]>([])
  selectedRef.current = selected

  const runSearch = useCallback(async () => {
    const text = query.trim()
    if (text === '') return
    setFetchingTle(true)
    setTleFetchError('')
    try {
      const found = await searchCelestrak(text)
      setResults(found)
      if (found.length === 0) setTleFetchError(t('fields.sat_search_none'))
    } catch {
      setResults(null)
      setTleFetchError(t('fields.tle_fetch_failed'))
    } finally {
      setFetchingTle(false)
    }
  }, [query, t])

  const addSatellite = useCallback((record: TleRecord) => {
    setSelected((prev) =>
      prev.some((entry) => entry.catnr === record.catnr)
        ? prev
        : [
            ...prev,
            { catnr: record.catnr, name: record.name, tle: tleText(record), source: 'search' },
          ],
    )
  }, [])

  const removeSatellite = useCallback((catnr: string) => {
    setSelected((prev) => {
      const going = prev.find((entry) => entry.catnr === catnr)
      const next = prev.filter((entry) => entry.catnr !== catnr)
      /* Never leave the chase pointing at something that is gone: the globe
         would exit follow on its own, but the panel would still say otherwise. */
      setFollowTargetId((current) => (current === catnr ? (next[0]?.catnr ?? '') : current))
      /* A group chip means "all of this group is here". Take one member out by
         hand and that stops being true, so the chip stops being lit. */
      if (going?.group) setActiveGroups((ids) => ids.filter((id) => id !== going.group))
      return next
    })
  }, [])

  /**
   * Empties the list. All of it. The button says REMOVE ALL, and a control
   * that quietly keeps one is a control that lies; the empty list is a state
   * the view fully supports.
   */
  const removeAll = useCallback(() => {
    setSelected([])
    setFollowTargetId('')
    setActiveGroups([])
    setSelectedFilter('')
  }, [])

  /** A group chip adds or removes its whole membership. */
  const toggleGroup = useCallback(
    async (group: CelestrakGroupId) => {
      if (activeGroups.includes(group)) {
        setActiveGroups((ids) => ids.filter((id) => id !== group))
        setSelected((prev) => {
          const next = prev.filter((entry) => entry.group !== group)
          setFollowTargetId((current) =>
            next.some((entry) => entry.catnr === current) ? current : (next[0]?.catnr ?? ''),
          )
          return next
        })
        return
      }
      setFetchingTle(true)
      setLoadingGroup(group)
      setGroupProgress(null)
      setTleFetchError('')
      setTleNotice('')
      try {
        const outcome = await fetchCelestrakGroup(group, {
          onProgress: (received, total) =>
            setGroupProgress(total === null ? null : received / total),
        })
        /* A group failure is its own thing. Telling someone who pressed
           STARLINK to paste a TLE by hand answers a question nobody asked. */
        if (!outcome.ok) {
          const minutes = Math.ceil((outcome.retryAfterMs ?? 0) / 60_000)
          setTleFetchError(
            outcome.reason !== 'throttled'
              ? t('fields.sat_group_failed')
              : minutes > 0
                ? t('fields.sat_group_retry', { minutes })
                : t('fields.sat_group_throttled'),
          )
          return
        }
        if (outcome.records.length === 0) {
          setTleFetchError(t('fields.sat_search_none'))
          return
        }
        if (outcome.stale) setTleNotice(t('fields.sat_group_stale'))
        setSelected((prev) => {
          const have = new Set(prev.map((entry) => entry.catnr))
          const added = outcome.records
            .filter((record) => !have.has(record.catnr))
            .map((record) => ({
              catnr: record.catnr,
              name: record.name,
              tle: tleText(record),
              source: 'group' as const,
              group,
            }))
          return [...prev, ...added]
        })
        setActiveGroups((ids) => [...ids, group])
      } catch {
        setTleFetchError(t('fields.sat_group_failed'))
      } finally {
        setFetchingTle(false)
        setLoadingGroup(null)
        setGroupProgress(null)
      }
    },
    [activeGroups, t],
  )

  /**
   * Re-fetches every selected element set from CelesTrak. The REFRESH button,
   * and only that: the opening load resolves its own selection through the
   * effect below instead, so nothing calls this on mount.
   *
   * Failure is not fatal: each entry keeps the set it had, and an old one
   * keeps rendering behind the stale banner, which is what that banner is for.
   */
  const refreshSelected = useCallback(async () => {
    setFetchingTle(true)
    setTleFetchError('')
    try {
      const current = selectedRef.current
      const refreshed = await Promise.all(
        current.map(async (entry) => {
          try {
            const [found] = await searchCelestrak(entry.catnr)
            return found ? { ...entry, name: found.name, tle: tleText(found) } : entry
          } catch {
            return entry
          }
        }),
      )
      setSelected(refreshed)
    } finally {
      setFetchingTle(false)
    }
  }, [])

  /*
   * The URL names the selection; the element sets come from CelesTrak. On open
   * that means one cached request per catalogue number, and it makes a
   * multi-satellite view shareable without putting TLEs in the address bar.
   */
  useEffect(() => {
    if (autoFetchedRef.current) return
    /*
     * A link's purpose is its selection, so an explicit one is resolved
     * whichever scene it opens in. Only a visitor who asked for nothing is
     * spared the request.
     */
    const explicitSelection = sats !== ISS_CATNR_TEXT || groups !== ''
    if (!onGlobe && !explicitSelection) return
    autoFetchedRef.current = true
    const wanted =
      sats === SATS_NONE
        ? []
        : sats.split(',').map((id) => id.trim()).filter((id) => /^\d+$/.test(id))
    /* An unknown group id in a link is dropped rather than fetched: the id set
       is ours, and a stale or hand-edited link must not turn into a request. */
    const wantedGroups = groups
      .split(',')
      .map((id) => id.trim())
      .filter((id): id is CelestrakGroupId => id in CELESTRAK_GROUPS)
    void (async () => {
      setFetchingTle(true)
      try {
        const found = await Promise.all(
          wanted.map(async (catnr): Promise<SelectedSatellite | null> => {
            try {
              const [record] = await searchCelestrak(catnr)
              return record
                ? { catnr, name: record.name, tle: tleText(record), source: 'search' }
                : null
            } catch {
              return null
            }
          }),
        )
        const resolved = found.filter((entry): entry is SelectedSatellite => entry !== null)
        /* Groups resolve through the same cache the chips use, so a shared
           Starlink link costs one request and usually none. */
        const fromGroups: SelectedSatellite[] = []
        const seen = new Set(resolved.map((entry) => entry.catnr))
        const loadedGroups: CelestrakGroupId[] = []
        for (const group of wantedGroups) {
          const outcome = await fetchCelestrakGroup(group)
          if (!outcome.ok || outcome.records.length === 0) continue
          loadedGroups.push(group)
          for (const record of outcome.records) {
            if (seen.has(record.catnr)) continue
            seen.add(record.catnr)
            fromGroups.push({
              catnr: record.catnr,
              name: record.name,
              tle: tleText(record),
              source: 'group',
              group,
            })
          }
        }
        const opening = [...resolved, ...fromGroups]
        /* The bundled ISS keeps the view alive if the network is down, but
           only when it is the one the link asked for; and a link that asked
           for NOTHING gets nothing, or clearing the list would never survive
           a reload and the bundled year-old element set would come back with
           its stale banner on every load. */
        if (opening.length > 0) setSelected(opening)
        else if (wantedGroups.length > 0) setTleFetchError(t('fields.sat_group_failed'))
        else if (wanted.length === 1 && wanted[0] === ISS_CATNR_TEXT) {
          setSelected(selectedRef.current)
        } else if (wanted.length === 0 && wantedGroups.length === 0) {
          setSelected([])
          setFollowTargetId('')
        } else if (wanted.length > 0) setTleFetchError(t('fields.tle_fetch_failed'))
        setActiveGroups(loadedGroups)
        setFollowTargetId((current) =>
          opening.some((entry) => entry.catnr === current)
            ? current
            : (opening[0]?.catnr ?? current),
        )
      } finally {
        setFetchingTle(false)
      }
    })()
  }, [onGlobe, sats, groups, t])

  /* Writes the selection back: singles by catalogue number, groups by id. */
  useEffect(() => {
    const singles = selected
      .filter((entry) => entry.source === 'search')
      .map((entry) => entry.catnr)
      .join(',')
    const nextSats = singles === '' ? SATS_NONE : singles
    const nextGroups = activeGroups.join(',')
    if (nextSats !== sats || nextGroups !== groups) {
      syncUrl({ sats: nextSats, groups: nextGroups })
    }
  }, [selected, activeGroups, sats, groups, syncUrl])

  return {
    selected,
    activeGroups,
    loadingGroup,
    groupProgress,
    selectedFilter,
    setSelectedFilter,
    followTargetId,
    setFollowTargetId,
    fetchingTle,
    tleFetchError,
    tleNotice,
    query,
    setQuery,
    results,
    runSearch,
    addSatellite,
    removeSatellite,
    removeAll,
    toggleGroup,
    refreshSelected,
  }
}
