import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GLOBE_MIN_ZOOM, GlobeMap } from '@/components/viz/GlobeMap'
import {
  SolarSystemScene,
  type SolarSatellite,
  type SolarSceneHandoff,
} from '@/components/viz/SolarSystemScene'
import type { GlobeObserver, GlobeSatellite, GlobeTrackPoint } from '@/components/viz/globe/types'
import { getBody, parseTle, eciSiToGeodetic, sunEciSi, type Vec3 } from '@/lib/physics'
import { cn } from '@/lib/utils'
import { SKY_BODY_IDS, type SkyBody, type SkyBodyId } from '@/components/viz/globe/celestial'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'
import { useSatelliteSwarm } from '@/lib/use-satellite-swarm'
import { satelliteColorAt } from '@/components/viz/globe/style'
import { isTypingTarget } from '@/components/viz/globe/controls-ui'
import { appearanceFor, trailRevolutionsFor } from '@/components/viz/globe/appearance'

import { parseCssRgba } from '@/components/viz/globe/color'
import { swarmScaleTier, globeDrawPath, canDrawPopulationTrails } from './orbital-view/tiers'
import { listWindowFor, scrollTopForIndex, SELECTED_ROW_HEIGHT_PX } from './orbital-view/list'
import { SkyPanel } from './orbital-view/SkyPanel'
import { trailProgressOf, utcStamp } from './orbital-view/clock'
import { sceneChipAction, type SceneId } from './orbital-view/scene'
import {
  ISS_CATNR_TEXT,
  useSatelliteSelection,
} from './orbital-view/use-satellite-selection'
import {
  INERTIAL_TRACK_SAMPLES,
  sampleInertialGeodeticTrack,
  samplePeriodTrack,
  tleAgeDays,
  trackPointAt,
  trackSpanEachSide,
  TRACK_BUCKET_MS,
} from './orbital-view/propagation'
import { buildSkyBodies, geocentricEciOf } from './orbital-view/sky-bodies'
import { satelliteTooltip, skyBodyTooltip } from './orbital-view/tooltips'
import {
  isMegaConstellationMember,
  resolveSatelliteDetail,
  type SatelliteDetailLink,
} from '@/lib/satellite-detail'
import {
  buildSolarRings,
  buildSolarSatellites,
  RING_BUCKET_MS,
} from './orbital-view/solar-view'
import { SatellitesPanel } from './orbital-view/SatellitesPanel'
import {
  ChromeDock,
  ChromeSheet,
  ViewAlert,
  type OrbitalChromeSheet,
} from '@/components/viz/globe/chrome-overlay'
import { useCompactChrome } from '@/lib/use-compact-chrome'
import { phaseAngleRad, worldDirectionOf } from './orbital-view/sky-math'
import type { SatRec } from 'satellite.js'

const LIVE_MARKER_INTERVAL_MS = 100
/** Subsolar point and twilight bands refresh on this cadence (see below). */
const SOLAR_TICK_MS = 60_000
const TLE_STALE_DAYS = 14
const OBSERVER_COLOR = '#f5f5f5'


/**
 * Satellites the SOLAR scene draws around its Earth. That scene has its own
 * renderer and propagates on the main thread, so it takes a slice rather than
 * a whole catalogue. Nothing about the globe depends on this.
 */
const SOLAR_SCENE_MAX = 200

/** Floor for the globe, so it can never collapse if the page height is unresolved. */
const GLOBE_MIN_HEIGHT_PX = 384

/**
 * Empty selection, spelled out. An empty `sky=` reads as absent and falls back
 * to the default, so "everything off" needs a token of its own to survive a
 * reload or a shared link.
 */
const SKY_NONE = 'none'



/** Colour of the mass swarm: a cool white that reads as a population, not a selection. */
const SWARM_COLOR = 'rgba(200,220,255,0.75)'


function roundedNum(defaultValue: number, opts: { min: number; max: number; digits: number }) {
  const factor = 10 ** opts.digits
  const base = numParam(defaultValue, { min: opts.min, max: opts.max })
  return {
    ...base,
    serialize: (value: number) => String(Math.round(value * factor) / factor),
  }
}

const SCHEMA = {
  /**
   * Comma-separated sky bodies to draw. The Sun is on by default: its billboard
   * has always been part of this view, and the checkbox now owns it.
   */
  sky: strParam('sun'),
  /** True-altitude layer. On by default: the orbit is the point of this view. */
  alt: strParam('1', ['0', '1']),
  /**
   * Comma-separated NORAD catalogue numbers, and ONLY the ones added one at a
   * time. Element sets are not in the URL, only the identities: the CelesTrak
   * module fetches them on open and its two-hour cache makes a shared link cost
   * at most one request per satellite.
   */
  sats: strParam(ISS_CATNR_TEXT),
  /**
   * Comma-separated CelesTrak group ids, carrying memberships rather than
   * members. A shared Starlink view is `groups=starlink`, not ten thousand
   * catalogue numbers, and the group is resolved through the same cache the
   * chips use.
   */
  groups: strParam(''),
  tw: roundedNum(1, { min: 0.25, max: 4, digits: 2 }),
  to: roundedNum(1, { min: 0.25, max: 4, digits: 2 }),
  ts: strParam('1', ['0', '1']),
  z: roundedNum(1.5, { min: -4, max: 22, digits: 2 }),
  pitch: roundedNum(0, { min: 0, max: 80, digits: 1 }),
  brg: roundedNum(0, { min: -180, max: 180, digits: 1 }),
  lng: roundedNum(0, { min: -180, max: 180, digits: 3 }),
  lat: roundedNum(20, { min: -90, max: 90, digits: 3 }),
  follow: strParam('0', ['0', '1']),
  sel: strParam(''),
} as const

/**
 * Scale hysteresis for the globe/solar handoff, as a factor on the scale the
 * globe hands over at. Leaving happens at the globe's zoom floor; coming back
 * needs the solar scene zoomed a little PAST that scale, so the boundary is a
 * band rather than a line and a reversed gesture cannot flap across it. Kept
 * small so the two frames still match: 10 percent of Earth's apparent radius.
 */
const HANDOFF_RETURN_HYSTERESIS = 1.1

/** Length of a chip-driven flight between the two scenes. */
const SCENE_FLIGHT_MS = 1100


const SCENES = ['globe', 'solar'] as const

/**
 * Fullscreen live view, in two scenes: the globe (ISS ground track, day/night
 * terminator, optional observer) and the solar system orrery.
 */
export function OrbitalViewTool() {
  const { t } = useTranslation()
  const [params, setParams] = useToolSearchParams({ scene: strParam('globe', SCENES) })
  const onGlobe = params.scene !== 'solar'
  const compactChrome = useCompactChrome()
  const [chromeSheet, setChromeSheet] = useState<OrbitalChromeSheet | null>(null)
  const [trailScopeNotice, setTrailScopeNotice] = useState('')
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, true>>({})
  const dismissAlert = useCallback((id: string) => {
    setDismissedAlerts((current) => ({ ...current, [id]: true }))
  }, [])
  const refusePopulationTrails = useCallback(
    (count: number) => {
      setTrailScopeNotice(t('fields.globe_trail_scope_all_too_many', { count }))
      setDismissedAlerts((current) => {
        if (!current.trailScope) return current
        const next = { ...current }
        delete next.trailScope
        return next
      })
    },
    [t],
  )
  const closeChromeSheet = useCallback(() => setChromeSheet(null), [])
  /** Scroll position and height of the SELECTED list, driving the row window. */
  const [listScroll, setListScroll] = useState({ top: 0, height: 360 })
  const [listRowHeight, setListRowHeight] = useState(SELECTED_ROW_HEIGHT_PX)
  const listRef = useRef<HTMLDivElement | null>(null)
  /** The catalogue search input, so the F shortcut can jump straight to it. */
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  /** The satellite under the pointer in the list, which keeps its full treatment. */
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null)

  /**
   * A click on the globe or the list PINS a satellite and asks the camera to
   * turn the planet under it. That is not Follow: Follow is the dedicated
   * chase control, and the list name only names who it would chase.
   *
   * Clearing the pin (a click on empty sky) does not clear the follow target.
   */
  const [frameTarget, setFrameTarget] = useState<{
    lon: number
    lat: number
    altKm: number
    nonce: number
  } | null>(null)
  const [geoError, setGeoError] = useState('')
  const [observer, setObserver] = useState<GlobeObserver | null>(null)
  const [p, setP] = useToolSearchParams(SCHEMA)
  const trailAppearance = {
    width: p.tw,
    opacity: p.to,
    onlySelected: p.ts === '1',
  }
  /**
   * Greenwich freeze for elevated globe geometry: swarm dots, swarm trails and
   * the identified full-treatment track. Latched while altitude stays on so a
   * hover cannot promote a Starlink onto a trail converted at a later Earth
   * orientation than the swarm has been flying.
   */
  const [storedInertialFreezeMs, setInertialFreezeMs] = useState<number | null>(() =>
    p.alt === '1' ? Date.now() : null,
  )
  const inertialFreezeMs = p.alt === '1' ? (storedInertialFreezeMs ?? Date.now()) : null
  if (inertialFreezeMs !== storedInertialFreezeMs) setInertialFreezeMs(inertialFreezeMs)
  /**
   * The satellite a click fixed on, which survives the pointer leaving it. Only
   * a click elsewhere moves or clears it, so a name can be read without keeping
   * the mouse perfectly still on a sub-pixel line.
   */
  const [pinnedSatelliteId, setPinnedSatelliteId] = useState<string | null>(
    () => p.sel || null,
  )
  /** The satellite the GLOBE says the pointer is over, pin aside. */
  const [globeHoverId, setGlobeHoverId] = useState<string | null>(null)
  /** The sky body the GLOBE says the pointer is over, for the panel's mark. */
  const [skyHoverId, setSkyHoverId] = useState<string | null>(null)
  /* The pin outranks the hover: having asked for one to stay, the viewer should
     not lose it by moving the pointer across the crowd on the way back. */
  const identifiedSatelliteId = pinnedSatelliteId ?? globeHoverId ?? hoveredSatelliteId
  /**
   * Encyclopedic read-more per catalogue number. Null means "looked up, none
   * public"; missing means "not asked yet". Mega-constellation members are
   * never asked.
   */
  const [detailByCatnr, setDetailByCatnr] = useState<
    ReadonlyMap<string, SatelliteDetailLink | null>
  >(() => new Map())
  const detailByCatnrRef = useRef(detailByCatnr)
  detailByCatnrRef.current = detailByCatnr
  /* The whole selection: what is on the view and where its element sets come
     from. One hook owns it, the URL round-trip included. */
  const selection = useSatelliteSelection({
    onGlobe,
    sats: p.sats,
    groups: p.groups,
    syncUrl: setP,
    t,
  })
  const {
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
  } = selection
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  useEffect(() => {
    if (!p.sel) return
    setPinnedSatelliteId(p.sel)
    setFollowTargetId(p.sel)
  }, [p.sel, setFollowTargetId])
  const pinSatellite = useCallback(
    (catnr: string | null) => {
      setPinnedSatelliteId(catnr)
      setP({ sel: catnr ?? '' })
      if (!catnr) return
      if (compactChrome) setChromeSheet(null)
      const entry = selectedRef.current.find((row) => row.catnr === catnr)
      if (!entry) return
      const parsed = parseTle(entry.tle)
      if (!parsed.ok) return
      const freeze = inertialFreezeMs != null ? new Date(inertialFreezeMs) : undefined
      const point = trackPointAt(parsed.satrec, new Date(), freeze)
      if (!point) return
      setFrameTarget((prev) => ({
        lon: point.lon,
        lat: point.lat,
        altKm: point.altKm,
        nonce: (prev?.nonce ?? 0) + 1,
      }))
    },
    [compactChrome, inertialFreezeMs, setP],
  )
  const resetView = useCallback(() => {
    setParams({ scene: 'globe' })
    setP({
      sky: 'sun',
      alt: '1',
      sats: ISS_CATNR_TEXT,
      groups: '',
      tw: 1,
      to: 1,
      ts: '1',
      z: 1.5,
      pitch: 0,
      brg: 0,
      lng: 0,
      lat: 20,
      follow: '0',
      sel: '',
    })
    setPinnedSatelliteId(null)
    setFrameTarget(null)
    setInertialFreezeMs(Date.now())
  }, [setParams, setP])
  useEffect(() => {
    const id = identifiedSatelliteId
    if (!id) return
    const entry = selected.find((row) => row.catnr === id)
    if (!entry || isMegaConstellationMember(entry.name)) return
    if (detailByCatnrRef.current.has(id)) return
    let cancelled = false
    void resolveSatelliteDetail(entry.catnr, entry.name).then((link) => {
      if (cancelled) return
      setDetailByCatnr((prev) => {
        if (prev.has(id)) return prev
        const next = new Map(prev)
        next.set(id, link)
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [identifiedSatelliteId, selected])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [liveMarkerMs, setLiveMarkerMs] = useState(() => Date.now())

  /* The second clock runs in both scenes: the solar scene draws the satellite
     too, and a ring a few tens of pixels across is live enough at 1 Hz.
     Re-armed to the next SECOND BOUNDARY rather than left on a fixed interval,
     because the header now shows this value to the second and a free-running
     1000 ms timer drifts until it skips one. */
  useEffect(() => {
    let timer = 0
    const tick = () => {
      setNowMs(Date.now())
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000))
    }
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000))
    return () => window.clearTimeout(timer)
  }, [])

  /* The 10 Hz marker is the globe's alone; on the solar scene it would re-render
     the page ten times a second to move a dot by nothing. */
  useEffect(() => {
    if (!onGlobe) return
    const id = setInterval(() => setLiveMarkerMs(Date.now()), LIVE_MARKER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [onGlobe])


  /*
   * How the whole selection is dressed, from its SIZE and nothing else. Every
   * satellite on screen gets these same numbers, so a GPS satellite among
   * thirty-two and a Starlink among thirty-two are drawn identically.
   */
  const appearance = appearanceFor(selected.length)
  const tier = swarmScaleTier(selected.length)

  /** The selected list after the panel's own filter. */
  const visibleSelected = useMemo(() => {
    const needle = selectedFilter.trim().toLowerCase()
    if (needle === '') return selected
    return selected.filter(
      (entry) =>
        entry.name.toLowerCase().includes(needle) || entry.catnr.includes(needle),
    )
  }, [selected, selectedFilter])

  /** Palette index by catalogue number, so a row costs a lookup and not a scan. */
  const paletteIndexOf = useMemo(() => {
    const index = new Map<string, number>()
    selected.forEach((entry, at) => index.set(entry.catnr, at))
    return index
  }, [selected])

  /*
   * Bring the identified satellite's row into view.
   *
   * The list is virtualised, so the row usually does not exist in the DOM to be
   * scrolled to: its position is arithmetic, index times row height, and that
   * is what is set. Only when the row is outside the visible band, so reading a
   * name never yanks a list the viewer is already reading.
   */
  useEffect(() => {
    const element = listRef.current
    if (!identifiedSatelliteId || !element) return
    const index = visibleSelected.findIndex((entry) => entry.catnr === identifiedSatelliteId)
    const next = scrollTopForIndex(
      index,
      listRowHeight,
      element.scrollTop,
      element.clientHeight,
      visibleSelected.length,
    )
    if (next !== null) element.scrollTop = next
  }, [identifiedSatelliteId, visibleSelected, listRowHeight])

  /**
   * The slice of the list that is actually on screen. Rows are a fixed height,
   * so the window is arithmetic: spacers above and below stand in for the rest
   * and keep the scrollbar honest.
   */
  const listWindow = useMemo(() => {
    const window = listWindowFor(
      visibleSelected.length,
      listScroll.top,
      listScroll.height,
      listRowHeight,
    )
    return {
      rows: visibleSelected.slice(window.first, window.first + window.count),
      padTop: window.padTopPx,
      padBottom: window.padBottomPx,
    }
  }, [visibleSelected, listScroll, listRowHeight])

  /**
   * The satellites that need a NAME on screen.
   *
   * Names cannot scale: past a few dozen they overlap into a smear. The count
   * decides how many there are; the pointer and the chase decide which. Crowd
   * members are still drawn, by the swarm, without a main-thread track.
   */
  const labelled = useMemo(() => {
    if (appearance.labelsAlwaysShown) return selected
    return selected.filter(
      (entry) => entry.catnr === followTargetId || entry.catnr === identifiedSatelliteId,
    )
  }, [selected, appearance.labelsAlwaysShown, followTargetId, identifiedSatelliteId])

  /*
   * What still gets propagated on the MAIN thread. On the globe that is only
   * the satellites carrying a name, since everything drawn comes from the
   * worker; the solar scene has its own renderer and takes a capped slice.
   */
  const mainThreadSet = useMemo(
    () => (onGlobe ? labelled : selected.slice(0, SOLAR_SCENE_MAX)),
    [onGlobe, labelled, selected],
  )

  /** Every drawn selection parsed once, with the colour its place in the list gives it. */
  const propagators = useMemo(
    () =>
      mainThreadSet.map((entry) => {
        const index = selected.findIndex((candidate) => candidate.catnr === entry.catnr)
        const result = parseTle(entry.tle)
        return {
          ...entry,
          color: satelliteColorAt(index < 0 ? 0 : index),
          satrec: result.ok ? result.satrec : null,
          error: result.ok ? null : result.error,
        }
      }),
    [mainThreadSet, selected],
  )

  /** The first element set that will not parse; one banner speaks for the selection. */
  const parseError = propagators.find((entry) => entry.error)?.error ?? null

  /** The oldest element set on screen: one banner speaks for the whole selection. */
  const staleTleDays = useMemo(() => {
    let worst: number | null = null
    for (const entry of propagators) {
      if (!entry.satrec) continue
      const ageDays = tleAgeDays(entry.satrec, nowMs)
      if (ageDays > TLE_STALE_DAYS) worst = Math.max(worst ?? 0, Math.round(ageDays))
    }
    return worst
  }, [propagators, nowMs])



  const instant = useMemo(() => new Date(liveMarkerMs), [liveMarkerMs])

  /* Solar illumination follows the real clock, quantised to a minute: the
     subsolar point drifts about 0.25 deg per minute, so recomputing faster
     buys nothing visible and re-tiles the bands for no reason. */
  const solarInstantMs = Math.floor(nowMs / SOLAR_TICK_MS) * SOLAR_TICK_MS
  const subsolar = useMemo(() => {
    const date = new Date(solarInstantMs)
    const geo = eciSiToGeodetic(sunEciSi(date), date)
    return geo ?? { latDeg: 0, lonDeg: 0, heightM: 0 }
  }, [solarInstantMs])

  /* Which sky bodies are on, from the URL so a view stays shareable. */
  const enabledSky = useMemo(() => {
    if (p.sky === SKY_NONE) return [] as SkyBodyId[]
    const wanted = new Set(p.sky.split(',').filter((id) => id.length > 0))
    return SKY_BODY_IDS.filter((id) => wanted.has(id))
  }, [p.sky])

  const setSkyEnabled = useCallback(
    (ids: readonly SkyBodyId[]) => setP({ sky: ids.length === 0 ? SKY_NONE : ids.join(',') }),
    [setP],
  )

  /*
   * TOOL shortcuts: selection and panels, kept separate from GlobeMap's own
   * camera keys (arrows, tilt, zoom, follow) because those live and repeat on
   * the map's own keydown, while these fire once against state this
   * component owns.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'f':
        case 'F':
          // F for Find: jumps to the catalogue search, which reaches every satellite in CelesTrak, not just the current selection.
          e.preventDefault()
          if (compactChrome) setChromeSheet('sats')
          window.setTimeout(() => {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
          }, 0)
          break
        case 'p':
        case 'P':
          // P for Planets: the same bulk action as the sky panel's own SHOW ALL / REMOVE ALL button.
          e.preventDefault()
          setSkyEnabled(enabledSky.length === 0 ? [...SKY_BODY_IDS] : [])
          break
        case 't':
        case 'T':
          e.preventDefault()
          if (p.ts === '1' && !canDrawPopulationTrails(selected.length, compactChrome)) {
            refusePopulationTrails(selected.length)
            break
          }
          setTrailScopeNotice('')
          setP({ ts: p.ts === '1' ? '0' : '1' })
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [compactChrome, enabledSky, setSkyEnabled, p.ts, setP, selected.length, refusePopulationTrails])

  useEffect(() => {
    if (p.ts === '1') return
    if (canDrawPopulationTrails(selected.length, compactChrome)) return
    setP({ ts: '1' })
    refusePopulationTrails(selected.length)
  }, [compactChrome, selected.length, p.ts, setP, refusePopulationTrails])

  /* Clicking a body's NAME points the camera at it; its checkbox still owns
     visibility. A fresh object each time, so asking twice aims twice. */
  const [aimDirection, setAimDirection] = useState<{
    direction: [number, number, number]
  } | null>(null)
  const aimAtBody = useCallback(
    (id: SkyBodyId) => {
      const date = new Date(solarInstantMs)
      setAimDirection({ direction: worldDirectionOf(geocentricEciOf(id, date), date) })
    },
    [solarInstantMs],
  )

  /* Directions, true angular sizes and orbit rings, on the solar tick. */
  const skyBodies = useMemo<SkyBody[]>(
    () => buildSkyBodies(enabledSky, solarInstantMs),
    [enabledSky, solarInstantMs],
  )

  /*
   * Who draws what, by tier: the rule this view stands on, restated because
   * losing half of it is exactly how it broke once already.
   *
   * NAMED tier (up to thirty satellites): the FULL TREATMENT on the main
   * thread. Each satellite gets a propagated Earth-fixed track of one and a
   * half revolutions either side of now, the pass being flown, the one before
   * it and the one after, three DISTINCT lines because the planet turns under
   * them, with the future half dashed, the camera-refined trail, the precise
   * marker and the name. The swarm is OFF here: it caches trails in the
   * inertial frame, where those three passes collapse onto one ring, and its
   * ninety-six samples per revolution are built for a crowd seen from afar,
   * not for one orbit looked at up close. Running both also drew every named
   * satellite twice, which is where the two ISS dots came from.
   *
   * TRAILS and DOTS tiers (above thirty): the swarm owns the crowd. The one
   * satellite being identified is not crowd: its track and marker go through
   * the full-treatment path. The swarm keeps packing that slot so deselect
   * can unhide it on the next frame, and the draw skips it while the
   * refined marker is up.
   */
  const fullTreatment = onGlobe && globeDrawPath(selected.length) === 'full'

  /*
   * WHICH satellites get the full-treatment track.
   *
   * In the named tier, all of them: that is the ownership rule. Above it the
   * swarm owns the crowd, but the ONE satellite being identified is not crowd:
   * it is the thing being looked at, and it goes through the exact same
   * code as a lone ISS: same track, same refinement, same dashed future,
   * converted with the swarm's Greenwich freeze so the live point does not
   * jump onto a parallel ellipse. This is the "hovered, pinned or
   * individually added satellite gets its own precisely refined trail"
   * that swarmTrails.ts has promised all along; the swarm's highlight ring
   * was standing in for it and could not keep the promise at close zoom.
   */
  const trackedIds = useMemo(() => {
    if (!onGlobe) return new Set<string>()
    if (fullTreatment) return new Set(selected.map((entry) => entry.catnr))
    return new Set(identifiedSatelliteId ? [identifiedSatelliteId] : [])
  }, [onGlobe, fullTreatment, selected, identifiedSatelliteId])

  /* Tracks re-anchor on a 30 s bucket so the sample grid is stable between
     the 100 ms marker ticks; GlobeMap re-tiles only when the grid moves. */
  const trackCenterMs = Math.floor(nowMs / TRACK_BUCKET_MS) * TRACK_BUCKET_MS
  const tracks = useMemo(() => {
    const out = new Map<string, GlobeTrackPoint[]>()
    const altitudeOn = p.alt === '1'
    /* Elevated: one inertial ellipse, same ring the solar scene draws.
       Earth-fixed: the count-rule span, rounded up to a resonant cycle. */
    const revolutions = altitudeOn ? 0.5 : trailRevolutionsFor(trackedIds.size)
    const freezeMs = altitudeOn ? (inertialFreezeMs ?? trackCenterMs) : undefined
    for (const entry of propagators) {
      if (!entry.satrec || !trackedIds.has(entry.catnr)) continue
      const points = altitudeOn
        ? sampleInertialGeodeticTrack(
            entry.satrec,
            trackCenterMs,
            revolutions,
            INERTIAL_TRACK_SAMPLES,
            freezeMs,
          )
        : samplePeriodTrack(
            entry.satrec,
            trackCenterMs,
            trackSpanEachSide(((2 * Math.PI) / entry.satrec.no) * 60, revolutions),
          )
      if (points.length > 1) out.set(entry.catnr, points)
    }
    return out
  }, [trackedIds, propagators, trackCenterMs, p.alt, inertialFreezeMs])

  /**
   * What the globe needs on the MAIN thread: names and the chase for every
   * tier, and in the named tier the full-treatment geometry as well. The
   * track arrays come from the bucketed memo above, so their identity is
   * stable across the 10 Hz marker ticks and GlobeMap's signature guards
   * keep re-tiling to the bucket cadence.
   */
  const satellites = useMemo<GlobeSatellite[]>(
    () =>
      propagators.map((entry) => {
        const owned = tracks.has(entry.catnr)
        const freeze = inertialFreezeMs != null ? new Date(inertialFreezeMs) : undefined
        return {
          id: entry.catnr,
          label: entry.name,
          color: entry.color,
          positions: tracks.get(entry.catnr),
          splitAt: owned ? instant : undefined,
          /* Crowd markers belong to the swarm. A second main-thread live
             point beside an inertial trail is the offset specks on SCIENCE. */
          livePosition:
            owned && entry.satrec
              ? (trackPointAt(entry.satrec, instant, freeze) ?? undefined)
              : undefined,
          positionAt:
            owned && entry.satrec
              ? (date: Date) => trackPointAt(entry.satrec as SatRec, date, freeze)
              : undefined,
        }
      }),
    [propagators, instant, tracks, inertialFreezeMs],
  )

  const satelliteTooltipFor = useCallback(
    (catnr: string) => {
      const entry = propagators.find((candidate) => candidate.catnr === catnr)
      const tip = entry?.satrec ? satelliteTooltip(entry.satrec, entry.name, liveMarkerMs, t) : null
      if (!tip) return null
      const link = detailByCatnr.get(catnr)
      if (!link) return tip
      return { ...tip, href: link.href, linkLabel: t('fields.globe_grokipedia') }
    },
    [propagators, liveMarkerMs, t, detailByCatnr],
  )

  const skyTooltipFor = useCallback(
    (bodyId: string) => skyBodyTooltip(bodyId, solarInstantMs, t),
    [solarInstantMs, t],
  )

  /*
   * The population, for the worker, and only when there IS a population.
   *
   * In the named tier the full treatment above owns every satellite, and the
   * swarm must not run underneath it: the same satellite drawn by both came
   * out as two dots, and the swarm's inertial one-ring trail under the full
   * treatment's three passes read as a trail that was wrong. Above the named
   * tier the swarm owns everything, and which group a satellite came from
   * reaches this point as nothing but its place in the list.
   */
  const swarmTles = useMemo(() => {
    if (!onGlobe || fullTreatment || selected.length === 0) return null
    return selected.map((entry, index) => {
      const [, line1, line2] = entry.tle.split('\n')
      const [red, green, blue] = parseCssRgba(satelliteColorAt(index))
      return {
        catnr: entry.catnr,
        line1,
        line2,
        rgb: [red, green, blue] as [number, number, number],
      }
    })
  }, [onGlobe, selected])
  /*
   * The identified satellite is the one whose trajectory the worker keeps
   * CURRENT; everything else keeps the cached revolution it loaded with.
   */
  const {
    keyframe: swarmKeyframe,
    status: swarmStatus,
    trailBatch: swarmTrailBatch,
    trailsDone: swarmTrailsDone,
  } = useSatelliteSwarm(
    swarmTles,
    appearance.trailRevolutions,
    identifiedSatelliteId,
    /* Population trails are only produced while something will draw them:
       in only-selected mode the identified satellite's trajectory is the
       full-treatment track, and ten thousand invisible rings are pure cost.
       Compact chrome also refuses the dots-tier crowd: that buffer OOMs phones. */
    !trailAppearance.onlySelected && canDrawPopulationTrails(selected.length, compactChrome),
    true,
    p.alt === '1',
    inertialFreezeMs,
  )
  /*
   * The catalogue numbers the WORKER accepted, in its own order.
   *
   * Deliberately not derived from the list handed to it: a real catalogue
   * carries element sets that will not parse, the worker drops those, and every
   * satellite after a dropped one would otherwise answer to its neighbour's
   * name for the rest of the session.
   */
  const swarmIds = swarmStatus.ids

  /*
   * How far the trails have got, for the panel's hairline.
   *
   * Read from the BATCHES rather than from the layer: batches are produced in
   * order and each one names the slice it filled, so the arrived prefix is
   * arithmetic and needs no reaching into WebGL from React. Null once there is
   * nothing left to wait for, which is what lets the indicator leave.
   */
  const swarmTrailProgress = useMemo(
    () =>
      trailProgressOf({
        total: swarmStatus.count,
        loading: swarmStatus.loading,
        done: swarmTrailsDone,
      }),
    [swarmStatus.count, swarmStatus.loading, swarmTrailsDone],
  )

  /*
   * Scene handoff. MapLibre stops at zoom -2, so "keep zooming out" cannot stay
   * on the globe: past the floor the view changes scenes instead. The scale
   * carries across, so Earth is the same size in the last globe frame and the
   * first solar one, and zooming back in on Earth returns the same way.
   */
  const [handoffPxPerMeter, setHandoffPxPerMeter] = useState<number | null>(null)
  /**
   * True while the crossing was asked for by a chip rather than the wheel. The
   * wheel wants the scales to match and stop there; a chip keeps flying to the
   * target view's own framing.
   */
  const [flying, setFlying] = useState(false)
  /** Bumped to ask the globe to fly out to its floor and hand over. */
  const [flyOutNonce, setFlyOutNonce] = useState(0)
  const [flyInNonce, setFlyInNonce] = useState(0)

  const leaveGlobe = useCallback(
    (planetRadiusPx: number) => {
      setHandoffPxPerMeter(planetRadiusPx / getBody('earth').radius)
      setParams({ scene: 'solar' })
      setFlying(false)
    },
    [setParams],
  )
  const returnToGlobe = useCallback(() => {
    setParams({ scene: 'globe' })
    setFlying(false)
  }, [setParams])
  const solarHandoff = useMemo<SolarSceneHandoff | undefined>(
    () =>
      handoffPxPerMeter === null
        ? undefined
        : {
            bodyId: 'earth',
            pxPerMeter: handoffPxPerMeter,
            returnPxPerMeter: handoffPxPerMeter * HANDOFF_RETURN_HYSTERESIS,
            onReturn: returnToGlobe,
            easeToDefaultMs: flying ? SCENE_FLIGHT_MS : undefined,
          },
    [handoffPxPerMeter, returnToGlobe, flying],
  )

  /*
   * The chips are flights, not switches: they take the same route the wheel
   * does, out through the zoom floor and across.
   *
   * Except when there is nowhere to fly back FROM. The return flight is the
   * solar scene zooming in until Earth reaches the scale the globe handed over
   * at, and that scale only exists if the globe handed it over: `leaveGlobe`
   * is what records it. Open `scene=solar` from a link and there is no handoff,
   * so the scene's fly-in effect returns on its first line and the chip did
   * nothing at all: the view was a one-way door for anyone who arrived by URL
   * rather than by wheel. With no handoff there is no flight to make, so the
   * chip goes back to being a switch, which is what it looks like.
   */
  const goToScene = useCallback(
    (scene: SceneId) => {
      const action = sceneChipAction(scene, onGlobe ? 'globe' : 'solar', handoffPxPerMeter !== null)
      if (action === 'ignore') return
      setChromeSheet(null)
      if (action === 'switch') {
        returnToGlobe()
        return
      }
      setFlying(true)
      if (action === 'flyOut') setFlyOutNonce((n) => n + 1)
      else setFlyInNonce((n) => n + 1)
    },
    [onGlobe, handoffPxPerMeter, returnToGlobe],
  )

  /*
   * A ring is one revolution of shape and barely changes between two ticks of
   * the clock, so it is rebuilt on a bucket while the markers keep the live
   * cadence.
   */
  const ringCenterMs = Math.floor(nowMs / RING_BUCKET_MS) * RING_BUCKET_MS
  const solarRings = useMemo(
    () => (onGlobe ? new Map<string, Vec3[]>() : buildSolarRings(propagators, ringCenterMs)),
    [onGlobe, propagators, ringCenterMs],
  )

  const solarSatellites = useMemo<SolarSatellite[]>(
    () => (onGlobe ? [] : buildSolarSatellites(propagators, solarRings, nowMs)),
    [onGlobe, propagators, solarRings, nowMs],
  )

  const moonPhaseAngleRad = useMemo(() => {
    if (!enabledSky.includes('moon')) return 0
    const date = new Date(solarInstantMs)
    return phaseAngleRad(geocentricEciOf('moon', date), sunEciSi(date))
  }, [enabledSky, solarInstantMs])

  function onUseMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoError(t('fields.geolocation_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setObserver({
          lat: Math.round(position.coords.latitude * 1e4) / 1e4,
          lon: Math.round(position.coords.longitude * 1e4) / 1e4,
          label: t('fields.marker_you'),
          color: OBSERVER_COLOR,
        })
        setGeoError('')
      },
      () => setGeoError(t('fields.geolocation_denied')),
    )
  }



  /*
   * The list's own measurements: its height follows the viewport (40vh) and a
   * row's height follows whichever font actually loaded, so both are read from
   * the element rather than assumed.
   */
  useEffect(() => {
    const element = listRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      setListScroll((current) =>
        current.height === element.clientHeight
          ? current
          : { ...current, height: element.clientHeight },
      )
      const row = element.querySelector('[data-sat-row]')
      const height = row instanceof HTMLElement ? row.offsetHeight : 0
      if (height > 0) setListRowHeight((current) => (current === height ? current : height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onGlobe, visibleSelected.length])





  const dockItems = onGlobe
    ? [
        { id: 'sats' as const, label: t('fields.chrome_sats') },
        { id: 'sky' as const, label: t('fields.chrome_sky') },
        { id: 'camera' as const, label: t('fields.chrome_camera') },
        { id: 'view' as const, label: t('fields.chrome_view') },
        ...(selected.length > 0
          ? [{ id: 'trails' as const, label: t('fields.chrome_trails') }]
          : []),
      ]
    : [{ id: 'bodies' as const, label: t('fields.chrome_bodies') }]
  const globeSheet =
    chromeSheet === 'camera' || chromeSheet === 'view' || chromeSheet === 'trails'
      ? chromeSheet
      : null

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden bg-bg">
      {onGlobe ? (
        <GlobeMap
          satellites={satellites}
          followTargetId={p.sel || followTargetId || undefined}
          followWanted={p.follow === '1'}
          onFollowChange={(on, id) =>
            setP({ follow: on ? '1' : '0', sel: id ?? p.sel })
          }
          cameraLng={p.lng}
          cameraLat={p.lat}
          cameraZoom={p.z}
          cameraPitch={p.pitch}
          cameraBearing={p.brg}
          onViewChange={(view) =>
            setP({
              lng: view.center[0],
              lat: view.center[1],
              z: view.zoom,
              brg: view.bearing,
              pitch: view.pitch,
            })
          }
          onResetView={resetView}
          observer={observer ?? undefined}
          subsolar={{ latDeg: subsolar.latDeg, lonDeg: subsolar.lonDeg }}
          skyBodies={skyBodies}
          showSun={enabledSky.includes('sun')}
          skyTooltipFor={skyTooltipFor}
          satelliteTooltipFor={satelliteTooltipFor}
          swarmKeyframe={swarmKeyframe}
          swarmColor={SWARM_COLOR}
          swarmPointSizePx={appearance.markerSizePx}
          swarmTrailBatch={swarmTrailBatch}
          swarmTrailCount={
            trailAppearance.onlySelected ||
            !canDrawPopulationTrails(selected.length, compactChrome)
              ? 0
              : swarmStatus.count
          }
          swarmTrailBaseWidthPx={appearance.trailWidthPx}
          swarmTrailBaseAlpha={appearance.trailAlpha}
          swarmTrailWidth={trailAppearance.width}
          swarmTrailOpacity={trailAppearance.opacity}
          swarmTrailOnlySelected={trailAppearance.onlySelected}
          swarmTrailProgress={swarmTrailProgress}
          trailScopeNotice={trailScopeNotice}
          onTrailAppearanceChange={(next) => {
            if (!next.onlySelected && !canDrawPopulationTrails(selected.length, compactChrome)) {
              refusePopulationTrails(selected.length)
              return
            }
            setTrailScopeNotice('')
            const ts = next.onlySelected ? '1' : '0'
            if (next.width === p.tw && next.opacity === p.to && ts === p.ts) return
            setP({ tw: next.width, to: next.opacity, ts })
          }}
          swarmIds={swarmIds}
          onSatelliteHover={setGlobeHoverId}
          onSkyBodyHover={setSkyHoverId}
          onSatellitePick={pinSatellite}
          onRequestMyLocation={onUseMyLocation}
          identifiedSatelliteId={identifiedSatelliteId}
          showSatelliteLabels={tier === 'named'}
          aimAt={aimDirection}
          frameTarget={frameTarget}
          moonPhaseAngleRad={moonPhaseAngleRad}
          showAltitude={p.alt === '1'}
          onAltitudeChange={(on) => setP({ alt: on ? '1' : '0' })}
          onZoomOutPastFloor={leaveGlobe}
          initialZoom={handoffPxPerMeter === null ? undefined : GLOBE_MIN_ZOOM}
          easeToDefaultOnOpen={flying}
          flyToFloorNonce={flyOutNonce}
          title={t('fields.title_orbital_view')}
          caption={`${
            /* The note is about the Moon and the planets; the Sun rides the
               same ephemeris the day/night shading is already declared on. */
            enabledSky.some((id) => id !== 'sun')
              ? `${t('fields.subtitle_orbital_view')} ${t('fields.globe_sky_note')}`
              : t('fields.subtitle_orbital_view')
          } ${t('fields.globe_leave_earth_hint')}`}
          height={GLOBE_MIN_HEIGHT_PX}
          compactChrome={compactChrome}
          chromeSheet={globeSheet}
          onChromeSheetClose={closeChromeSheet}
        />
      ) : (
        <SolarSystemScene
          height={GLOBE_MIN_HEIGHT_PX}
          handoff={solarHandoff}
          onReturnToGlobe={returnToGlobe}
          satellites={solarSatellites}
          flyToReturnNonce={flyInNonce}
          compactChrome={compactChrome}
          bodiesSheetOpen={chromeSheet === 'bodies'}
          onBodiesSheetClose={closeChromeSheet}
        />
      )}

      <div className="pointer-events-none absolute left-3 top-[max(0.75rem,var(--safe-top))] z-10 flex max-w-[calc(100%-9rem)] flex-col gap-1 sm:left-4">
        <Link
          to="/tools"
          className="pointer-events-auto w-fit font-mono text-[10px] uppercase tracking-[0.14em] text-subtle transition-colors hover:text-fg"
        >
          ← {t('tool.back')}
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg sm:text-xs">
          {t('fields.title_orbital_view')}
          {/*
            The clock says WHICH instant the picture is of. Everything here is
            propagated to now, so a frozen scene and a live one look identical
            without it. UTC with an explicit +0000 rather than the reader's own
            zone: element sets, GMST and the day/night terminator are all in
            UTC, so a local time would be the one number on screen that has to
            be converted before it can be compared with anything else.
          */}
          <time
            dateTime={new Date(nowMs).toISOString()}
            className="tabular-nums normal-case tracking-normal text-subtle"
          >
            {utcStamp(nowMs)}
          </time>
        </h1>
      </div>

      {/* One left-hand column: the sky bodies, then the satellites under them.
          Both are overlays on the globe, so both leave with it. */}
      {/* Ends 12rem above the bottom: the footer strip (hint, caption and the
          attribution bar) owns that band. The COLUMN itself never scrolls:
          scrolling a stack of panels hides whole panels, and on a large screen
          it scrolled for no reason at all. The max-height squeezes the one
          child built to shrink, the satellite LIST, which scrolls internally
          while the sky panel and the group chips stay put. */}
      {compactChrome ? null : (
      <div className="pointer-events-auto absolute left-4 top-20 z-10 flex max-h-[calc(100%-12rem)] flex-col gap-2">
        {/*
          Globe overlays only: the solar scene has its own body list in the same
          corner. Gated on the SCENE and not on how many bodies are ticked: the
          panel is the only way to tick one, so hiding it when the list is empty
          made emptying it a one-way door.
        */}
        {onGlobe ? (
          <div className="flex shrink-0 flex-col gap-1">
            <SkyPanel
              enabled={enabledSky}
              onEnabledChange={setSkyEnabled}
              onAim={aimAtBody}
              highlighted={skyHoverId}
            />
          </div>
        ) : null}
        {onGlobe ? (
          <SatellitesPanel
            searchInputRef={searchInputRef}
            query={query}
            onQueryChange={setQuery}
            onSearch={() => void runSearch()}
            fetchingTle={fetchingTle}
            results={results}
            addSatellite={addSatellite}
            selected={selected}
            visibleSelected={visibleSelected}
            selectedFilter={selectedFilter}
            onFilterChange={(next) => {
              setSelectedFilter(next)
              setListScroll((current) => ({ ...current, top: 0 }))
            }}
            refreshSelected={() => void refreshSelected()}
            removeAll={removeAll}
            removeSatellite={removeSatellite}
            followTargetId={followTargetId}
            setFollowTargetId={setFollowTargetId}
            setHoveredSatelliteId={setHoveredSatelliteId}
            listRef={listRef}
            identifiedSatelliteId={identifiedSatelliteId}
            /* Same bridge as the globe click: a pin from either surface is
               also the thing Follow will chase. */
            onPin={pinSatellite}
            onListScroll={(top, height) => setListScroll({ top, height })}
            listWindow={listWindow}
            paletteIndexOf={paletteIndexOf}
            tier={tier}
            activeGroups={activeGroups}
            loadingGroup={loadingGroup}
            groupProgress={groupProgress}
            toggleGroup={(group) => void toggleGroup(group)}
            swarmStatus={swarmStatus}
            fetchError={tleFetchError}
            fetchNotice={tleNotice}
          />
        ) : null}
      </div>
      )}

      {compactChrome && onGlobe ? (
        <>
          <ChromeSheet
            open={chromeSheet === 'sats'}
            title={t('fields.sat_panel')}
            onClose={closeChromeSheet}
            fullHeight
          >
            <SatellitesPanel
              searchInputRef={searchInputRef}
              query={query}
              onQueryChange={setQuery}
              onSearch={() => void runSearch()}
              fetchingTle={fetchingTle}
              results={results}
              addSatellite={addSatellite}
              selected={selected}
              visibleSelected={visibleSelected}
              selectedFilter={selectedFilter}
              onFilterChange={(next) => {
                setSelectedFilter(next)
                setListScroll((current) => ({ ...current, top: 0 }))
              }}
              refreshSelected={() => void refreshSelected()}
              removeAll={removeAll}
              removeSatellite={removeSatellite}
              followTargetId={followTargetId}
              setFollowTargetId={setFollowTargetId}
              setHoveredSatelliteId={setHoveredSatelliteId}
              listRef={listRef}
              identifiedSatelliteId={identifiedSatelliteId}
              onPin={pinSatellite}
              onListScroll={(top, height) => setListScroll({ top, height })}
              listWindow={listWindow}
              paletteIndexOf={paletteIndexOf}
              tier={tier}
              activeGroups={activeGroups}
              loadingGroup={loadingGroup}
              groupProgress={groupProgress}
              toggleGroup={(group) => void toggleGroup(group)}
              swarmStatus={swarmStatus}
              fetchError={tleFetchError}
              fetchNotice={tleNotice}
              framed={false}
            />
          </ChromeSheet>
          <ChromeSheet
            open={chromeSheet === 'sky'}
            title={t('fields.globe_sky_bodies')}
            onClose={closeChromeSheet}
          >
            <SkyPanel
              enabled={enabledSky}
              onEnabledChange={setSkyEnabled}
              onAim={aimAtBody}
              highlighted={skyHoverId}
              framed={false}
            />
          </ChromeSheet>
        </>
      ) : null}

      <div className="absolute right-3 top-[max(0.75rem,var(--safe-top))] z-10 flex flex-col items-end gap-2 sm:right-4">
        {/* Same dress and same gap as the row under it: an active control is
            gold-bordered gold text everywhere on this view, and two adjacent
            rows with different actives read as two different products. The
            shared Chip keeps its own style for the tool pages. */}
        <div className="flex items-center gap-2" role="group" aria-label={t('fields.scene_view')}>
          {(['globe', 'solar'] as const).map((scene) => (
            <button
              key={scene}
              type="button"
              aria-pressed={(scene === 'globe') === onGlobe}
              onClick={() => goToScene(scene)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center border border-border-strong bg-surface/80 px-3 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-fg',
                (scene === 'globe') === onGlobe && 'border-warn text-warn',
              )}
            >
              {t(scene === 'globe' ? 'fields.scene_globe' : 'fields.scene_solar')}
            </button>
          ))}
        </div>
        {/* The sky toggle lives in the PLANETS & MOON panel and the location
            button in the CAMERA panel: each control beside the thing it acts
            on, and this corner keeps only the scene choice. */}
      </div>

      {!onGlobe ||
      (!parseError &&
        staleTleDays === null &&
        !tleFetchError &&
        !tleNotice &&
        !geoError &&
        !trailScopeNotice) ? null : (
        <div
          className={cn(
            'absolute z-20 flex flex-col gap-1.5',
            compactChrome
              ? 'left-[max(0.75rem,var(--safe-left))] right-[max(0.75rem,var(--safe-right))] top-[calc(max(0.75rem,var(--safe-top))+4.5rem)]'
              : 'left-1/2 top-3 w-full max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2',
          )}
        >
          {parseError && !dismissedAlerts.parse ? (
            <ViewAlert onDismiss={() => dismissAlert('parse')}>{parseError}</ViewAlert>
          ) : null}
          {staleTleDays !== null && !dismissedAlerts.stale ? (
            <ViewAlert tone="warn" onDismiss={() => dismissAlert('stale')}>
              {t('fields.tle_stale_warning', { days: staleTleDays })}
            </ViewAlert>
          ) : null}
          {tleFetchError && !dismissedAlerts.tleError ? (
            <ViewAlert onDismiss={() => dismissAlert('tleError')}>{tleFetchError}</ViewAlert>
          ) : null}
          {tleNotice && !dismissedAlerts.tleNotice ? (
            <ViewAlert onDismiss={() => dismissAlert('tleNotice')}>{tleNotice}</ViewAlert>
          ) : null}
          {geoError && !dismissedAlerts.geo ? (
            <ViewAlert onDismiss={() => dismissAlert('geo')}>{geoError}</ViewAlert>
          ) : null}
          {trailScopeNotice && !dismissedAlerts.trailScope ? (
            <ViewAlert
              tone="warn"
              onDismiss={() => {
                dismissAlert('trailScope')
                setTrailScopeNotice('')
              }}
            >
              {trailScopeNotice}
            </ViewAlert>
          ) : null}
        </div>
      )}

      {compactChrome ? (
        <ChromeDock
          items={dockItems}
          active={chromeSheet}
          onSelect={(id) => setChromeSheet((current) => (current === id ? null : id))}
        />
      ) : null}
    </div>
  )
}
