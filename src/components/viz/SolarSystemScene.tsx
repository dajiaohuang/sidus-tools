/**
 * Solar system orrery (Canvas 2D), drawn at true scale.
 *
 * Every number on screen comes from `@/lib/physics/planets`: the orbit curves
 * are the planets' own ellipses sampled through a full turn of mean anomaly,
 * the bodies sit at their heliocentric positions in metres, and the disks are
 * lit by the real Sun direction. There is one scale factor, px per metre, so
 * distances stay in proportion at every zoom.
 *
 * The two places that scale honesty has to bend, and both are stated in the
 * caption the scene renders:
 *
 * - A body whose true radius projects below 2.5 px is drawn at 2.5 px, or it
 *   would be invisible at any zoom that also shows its orbit.
 * - The glow around the Sun is a fixed 8 px halo, not a physical extent.
 *
 * Camera: orthographic and TARGET-LOCKED. There is always a focused body, Earth
 * to begin with, and it holds the canvas centre: dragging orbits around it
 * (bearing about the ecliptic pole, tilt above the ecliptic plane) and the wheel
 * dollies toward or away from it. There is no free pan, which is what makes a
 * true-scale scene navigable: at the zoom where the Moon separates from Earth,
 * Earth is roughly 10^5 px from the Sun, and any camera you could pan would
 * spend its time lost between them. The focus tracks its body's live position,
 * so a planet on its orbit stays centred as it moves. Clicking another body
 * eases the camera onto it; double click returns to Earth.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlanetId } from '@/lib/physics'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { tooltipProps } from '@/components/shared/tooltip'
import { parseCssRgba } from '@/components/viz/globe/color'
import { cn } from '@/lib/utils'
import {
  AU,
  BODY_IDS,
  PLANET_IDS,
  bodyOrientation,
  earthHeliocentricEclipticSi,
  getBody,
  moonGeocentricEciSi,
  planetElementsAt,
  planetHeliocentricEclipticSi,
  type BodyId,
  type BodyOrientation,
  type Vec3,
} from '@/lib/physics'
import {
  cameraBasis,
  directionInView,
  eclipticFromEquatorial,
  phaseGeometry,
  poleDirectionEcliptic,
  primeMeridianDirectionEcliptic,
  projectPoint,
  sampleOrbitEllipse,
  sunDirectionInView,
  type CameraBasis,
  type SolarCamera,
} from './solar/scene-math'
import { bodyFactsAt } from './solar/body-facts'

const TAU = Math.PI * 2
const BACKGROUND = '#050506'

/** Smallest on-screen body radius: below this a true-scale disk would vanish. */
const MIN_MARKER_PX = 2.5
/** A disk narrower than this cannot show a terminator, so it is drawn flat. */
const PHASE_MIN_PX = 4
/** Below this the axis line and meridian tick are noise rather than geometry. */
const AXIS_MIN_PX = 6
/** Earth and Moon share one marker once they are this close on screen. */
const MOON_MERGE_PX = 4

/** Half-width of the initial frame: the inner system out past Mars' aphelion. */
const INITIAL_HALF_EXTENT_M = 1.7 * AU
/** Zoomed all the way out, 1.7 au becomes 34 au: past Neptune's aphelion. */
const ZOOM_MIN = 0.05
const ZOOM_MAX = 5000

/** Bodies move by a fraction of a pixel per minute at these scales. */
const RECOMPUTE_MS = 60_000

const MOON_PATH_SAMPLES = 240
const SIDEREAL_MONTH_MS = 27.321661 * 86_400_000

const ORBIT_BRIGHTNESS = 0.85
const ORBIT_ALPHA = 0.4
const NIGHT_BRIGHTNESS = 0.2
const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace'

/** The scene always has a focus; every supplied satellite is one of the choices. */
export type SatelliteFocusId = `sat:${string}`
export type SolarFocusId = BodyId | SatelliteFocusId
export const satelliteFocusId = (id: string): SatelliteFocusId => `sat:${id}`
const isSatelliteFocus = (focus: SolarFocusId): focus is SatelliteFocusId =>
  focus.startsWith('sat:')

type ViewState = {
  bearingRad: number
  tiltRad: number
  /** Multiplier on the fit-to-viewport scale, not a length. */
  zoom: number
  /** The camera orbits this body and keeps it at the canvas centre. */
  focusId: SolarFocusId
}

const VIEW0: ViewState = { bearingRad: 0.6, tiltRad: 0.62, zoom: 1, focusId: 'earth' }

/** Eased travel when the focus changes, so the new body slides to the centre. */
const FOCUS_PAN_MS = 700
/** A pointer that moved less than this between down and up is a click, not a drag. */
const CLICK_SLOP_PX = 4
/** Extra picking radius around a body's drawn marker. */
const PICK_PAD_PX = 8
/** The focused body's own orbit line fades out across this marker-radius band. */
const ORBIT_FADE_START_PX = 3
const ORBIT_FADE_END_PX = 8
/** A satellite's ring is drawn only once it is this big, or it is just noise on Earth. */
const SATELLITE_RING_MIN_PX = 12
/** Above this many drawn satellites the names stop being readable, so they stop. */
const SATELLITE_LABEL_MAX = 30

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const lerpVec = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
]

type SceneBody = {
  id: BodyId
  posM: Vec3
  radiusM: number
  color: string
  orientation: BodyOrientation
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/** px per metre at zoom 1, so the initial frame follows the viewport size. */
function baseScalePxPerM(w: number, h: number): number {
  return (Math.min(w, h) * 0.46) / INITIAL_HALF_EXTENT_M
}

function toCamera(view: ViewState, w: number, h: number, centerM: Vec3): SolarCamera {
  return {
    bearingRad: view.bearingRad,
    tiltRad: view.tiltRad,
    scalePxPerM: baseScalePxPerM(w, h) * view.zoom,
    centerM,
  }
}

/** Wheel delta to a zoom factor, normalised across the three delta modes. */
function wheelZoomFactor(e: WheelEvent): number {
  let dy = e.deltaY
  if (e.deltaMode === 1) dy *= 16
  if (e.deltaMode === 2) dy *= 400
  dy = Math.max(-120, Math.min(120, dy))
  return Math.exp(-dy * 0.0022)
}

/** A body colour scaled toward black, for night sides and orbit lines. */
function shade(color: string, brightness: number, alpha = 1): string {
  const [r, g, b] = parseCssRgba(color)
  const ch = (v: number) => Math.round(v * 255 * brightness)
  return `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${alpha})`
}

/** `2026-08-20 12:34 UTC`: an instant, not localised copy. */
function utcStamp(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/**
 * The tool's live satellite, drawn around Earth once the view is close enough
 * for its ring to mean anything.
 *
 * Positions arrive in the propagator's own equatorial frame (TEME for SGP4) and
 * are rotated to the ecliptic with the same J2000 obliquity the Moon uses. That
 * conflates TEME with J2000, worth up to about 0.3 deg of orientation: real, and
 * far below what a ring a few tens of pixels across can show. The alternative,
 * a full TEME-to-J2000 chain, would buy nothing visible here.
 */
export type SolarSatellite = {
  /** Stable identity, so focus survives the per-second rebuild. */
  id: string
  label: string
  color: string
  /** Current geocentric position, equatorial metres. */
  positionEciM: Vec3
  /** One full revolution sampled in the same frame, metres. */
  orbitEciM: Vec3[]
  altitudeM: number
  orbitalPeriodS: number
  speedMs: number
}

/**
 * Continuity contract with a closer scene, so a single wheel gesture can carry
 * the view across the boundary between them.
 *
 * The scene's own controls are untouched by this: it only sets the opening
 * camera and reports the one crossing back. Both thresholds are the caller's
 * to choose, which is what keeps the hysteresis band in one place.
 */
export type SolarSceneHandoff = {
  /** Open centred on this body. */
  bodyId: BodyId
  /** Opening scale, so the body arrives at the size it had in the other scene. */
  pxPerMeter: number
  /** Zooming in past this scale, with the body still centred, calls onReturn. */
  returnPxPerMeter: number
  onReturn: () => void
  /**
   * Set when the crossing was a button rather than a wheel gesture: after
   * opening at the matching scale, keep flying to this scene's own framing.
   */
  easeToDefaultMs?: number
}

/** How far the handoff body may drift from the centre and still count as centred. */
const HANDOFF_CENTERED_FRACTION = 0.25

export type SolarSystemSceneProps = {
  className?: string
  /** Optional min-height (px) when the parent does not stretch. */
  height?: number
  /** Set only when a closer scene handed the view over; absent means a normal open. */
  handoff?: SolarSceneHandoff
  /** The caller's live satellites. Each is hidden until its ring is resolvable. */
  satellites?: SolarSatellite[]
  /** Bumping this flies in to the handoff scale and hands the view back. */
  flyToReturnNonce?: number
}

/** Live orrery: true ellipses, true distances, real sun-phase shading. */
export function SolarSystemScene({
  className,
  height,
  handoff,
  satellites,
  flyToReturnNonce,
}: SolarSystemSceneProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<ViewState>(VIEW0)
  const viewRef = useRef(view)
  viewRef.current = view
  const drag = useRef<{ x: number; y: number; bearing: number; tilt: number } | null>(null)

  const [visible, setVisible] = useState<Record<BodyId, boolean>>(() => {
    const all = {} as Record<BodyId, boolean>
    for (const id of BODY_IDS) all[id] = true
    return all
  })

  const [instantMs, setInstantMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setInstantMs(Date.now()), RECOMPUTE_MS)
    return () => clearInterval(id)
  }, [])
  const date = useMemo(() => new Date(instantMs), [instantMs])

  const scene = useMemo(() => {
    const orbits = PLANET_IDS.map((id) => ({
      id,
      color: getBody(id).color,
      points: sampleOrbitEllipse(planetElementsAt(id, date)),
    }))

    /* Standish's table row for Earth is the Earth/Moon barycentre, which is up
       to 4671 km off Earth's centre: far too small to see here, but the Moon
       hangs off this position, so the corrected centre is the honest anchor. */
    const earthM = earthHeliocentricEclipticSi(date)
    const moonOffsetM = eclipticFromEquatorial(moonGeocentricEciSi(date))

    const positionOf = (id: BodyId): Vec3 => {
      if (id === 'sun') return [0, 0, 0]
      if (id === 'earth') return earthM
      if (id === 'moon') {
        return [
          earthM[0] + moonOffsetM[0],
          earthM[1] + moonOffsetM[1],
          earthM[2] + moonOffsetM[2],
        ]
      }
      return planetHeliocentricEclipticSi(id, date)
    }

    const bodies: SceneBody[] = BODY_IDS.map((id) => ({
      id,
      posM: positionOf(id),
      radiusM: getBody(id).radius,
      color: getBody(id).color,
      orientation: bodyOrientation(id, date),
    }))

    /* One sidereal month of the lunar model, hung on the Earth position of
       this instant: the shape of the true orbit, not a trail of where the Moon
       has been while Earth moved on. */
    const moonPath: Vec3[] = []
    for (let i = 0; i <= MOON_PATH_SAMPLES; i++) {
      const at = new Date(instantMs + (i / MOON_PATH_SAMPLES - 0.5) * SIDEREAL_MONTH_MS)
      const g = eclipticFromEquatorial(moonGeocentricEciSi(at))
      moonPath.push([earthM[0] + g[0], earthM[1] + g[1], earthM[2] + g[2]])
    }

    return { orbits, bodies, moonPath, earthM }
  }, [date, instantMs])

  /* The satellite lives in Earth's frame, so it is rebuilt on the caller's
     cadence rather than the scene's minute tick: it moves kilometres a second. */
  const satelliteScene = useMemo(() => {
    const earthM = scene.earthM
    const toScene = (eci: Vec3): Vec3 => {
      const e = eclipticFromEquatorial(eci)
      return [earthM[0] + e[0], earthM[1] + e[1], earthM[2] + e[2]]
    }
    return (satellites ?? []).map((entry) => ({
      payload: entry,
      posM: toScene(entry.positionEciM),
      ringM: entry.orbitEciM.map(toScene),
      /** Ring radius in metres, for the resolvability test. */
      orbitRadiusM: Math.hypot(...entry.positionEciM),
    }))
  }, [satellites, scene.earthM])

  const handoffRef = useRef(handoff)
  handoffRef.current = handoff
  const sceneRef = useRef(scene)
  sceneRef.current = scene

  /**
   * Where the camera is aiming right now. Derived from the focus rather than
   * stored, which is what makes the focus track a body that is itself moving:
   * a planet on its orbit, or the Moon around Earth, stays centred by itself.
   */
  const focusPositionM = useCallback(
    (focusId: SolarFocusId): Vec3 => {
      if (isSatelliteFocus(focusId)) {
        const wanted = focusId.slice(4)
        const found = satelliteSceneRef.current.find((s) => s.payload.id === wanted)
        return found?.posM ?? sceneRef.current.earthM
      }
      return sceneRef.current.bodies.find((b) => b.id === focusId)?.posM ?? [0, 0, 0]
    },
    [],
  )
  const satelliteSceneRef = useRef(satelliteScene)
  satelliteSceneRef.current = satelliteScene

  /** In-flight travel to a new focus: a fixed start point and a moving target. */
  const panRef = useRef<{ fromM: Vec3; startedAt: number } | null>(null)
  /** In-flight zoom, for the chip route between the two scenes. */
  const zoomFlightRef = useRef<{
    from: number
    to: number
    startedAt: number
    durationMs: number
    onArrive: (() => void) | null
  } | null>(null)
  /** Centre of the last drawn frame, so a new pan starts from what is on screen. */
  const lastCenterRef = useRef<Vec3>([0, 0, 0])
  /** What the last frame drew and where, for picking with the pointer. */
  const pickRef = useRef<{ id: SolarFocusId; x: number; y: number; rPx: number }[]>([])
  /** Only filled once the debug facility asks; inert otherwise. */
  const solarDebugRef = useRef<{
    armed: boolean
    camera: {
      focusId: string
      handoff: { bodyId: string; returnPxPerMeter: number } | null
      bearingRad: number
      tiltRad: number
      scalePxPerM: number
      centerM: [number, number, number]
      widthPx: number
      heightPx: number
    } | null
    orbits: {
      id: string
      maxRadiusM: number
      maxRadiusPx: number
      samples: { posM: [number, number, number]; screen: { x: number; y: number } }[]
    }[]
  }>({ armed: false, camera: null, orbits: [] })

  /* Dev-only, and only when the URL asks: lets a verification run read what a
     click would hit instead of guessing at pixels. Dead code in production. */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (new URLSearchParams(window.location.search).get('debug') !== 'proj') return
    void import('@/lib/debug-projection').then((mod) => {
      mod.registerDebugProjection({
        solarPicks: () => pickRef.current.map((p) => ({ ...p })),
        solarCamera: () => {
          solarDebugRef.current.armed = true
          return solarDebugRef.current.camera
        },
        solarOrbits: () => {
          solarDebugRef.current.armed = true
          return solarDebugRef.current.orbits.map((o) => ({ ...o }))
        },
        solarBodyPositionAt: (id: string, timeMs: number) => {
          if (id === 'sun') return [0, 0, 0]
          if (id === 'moon') {
            const at = new Date(timeMs)
            const e = planetHeliocentricEclipticSi('earth', at)
            const g = eclipticFromEquatorial(moonGeocentricEciSi(at))
            return [e[0] + g[0], e[1] + g[1], e[2] + g[2]]
          }
          if (id === 'moon') return null
          const q = planetHeliocentricEclipticSi(id as PlanetId, new Date(timeMs))
          return [q[0], q[1], q[2]]
        },
      })
    })
  }, [])
  const [infoId, setInfoId] = useState<SolarFocusId | null>(null)

  const setFocus = useCallback((focusId: SolarFocusId) => {
    if (viewRef.current.focusId === focusId) return
    panRef.current = { fromM: lastCenterRef.current, startedAt: performance.now() }
    setView((prev) => ({ ...prev, focusId }))
  }, [])

  /** Centre for this frame, easing while a focus change is in flight. */
  const currentCenterM = useCallback(
    (focusId: SolarFocusId): Vec3 => {
      const target = focusPositionM(focusId)
      const pan = panRef.current
      if (!pan) return target
      const k = Math.min(1, (performance.now() - pan.startedAt) / FOCUS_PAN_MS)
      if (k >= 1) {
        panRef.current = null
        return target
      }
      // Smoothstep: starts and ends at rest, so the travel has no visible kick.
      return lerpVec(pan.fromM, target, k * k * (3 - 2 * k))
    },
    [focusPositionM],
  )

  /* Opening camera for a handed-over view: centred on the body at the scale it
     already had, so the two scenes share one frame. Runs once, and only when a
     caller asked for it, so a plain visit still opens on VIEW0. */
  const openedRef = useRef(false)
  useEffect(() => {
    const el = canvasRef.current
    if (!handoff || openedRef.current || !el) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (w < 2 || h < 2) return
    const body = scene.bodies.find((candidate) => candidate.id === handoff.bodyId)
    if (!body) return
    openedRef.current = true
    const openingZoom = clampZoom(handoff.pxPerMeter / baseScalePxPerM(w, h))
    setView({ ...VIEW0, zoom: openingZoom, focusId: handoff.bodyId })
    /* A chip flight opens at the matching scale for continuity and then keeps
       going to this scene's own framing; a wheel handoff stops here, because
       the gesture that started it is still running and owns the rest. */
    if (handoff.easeToDefaultMs) {
      zoomFlightRef.current = {
        from: openingZoom,
        to: VIEW0.zoom,
        startedAt: performance.now(),
        durationMs: handoff.easeToDefaultMs,
        onArrive: null,
      }
    }
  }, [handoff, scene])

  /* Flying back to the closer scene: run the zoom in to the crossing scale and
     hand over on arrival, so the button takes the wheel's route. Same guard as
     the globe's outward flight: only a change after mount counts. */
  const handledFlyInRef = useRef(flyToReturnNonce ?? 0)
  useEffect(() => {
    const el = canvasRef.current
    const back = handoffRef.current
    if (!flyToReturnNonce || !el || !back) return
    if (handledFlyInRef.current === flyToReturnNonce) return
    handledFlyInRef.current = flyToReturnNonce
    const base = baseScalePxPerM(el.clientWidth, el.clientHeight)
    if (!(base > 0)) return
    zoomFlightRef.current = {
      from: viewRef.current.zoom,
      to: clampZoom(back.returnPxPerMeter / base),
      startedAt: performance.now(),
      durationMs: FOCUS_PAN_MS,
      onArrive: back.onReturn,
    }
  }, [flyToReturnNonce])

  /**
   * True when this wheel step should hand the view back to the closer scene, in
   * which case the caller was told and this scene must not also move.
   *
   * The test is a LEVEL, not an edge. An edge test, `before < threshold &&
   * after >= threshold`, locks out any view that reaches the threshold by
   * another route: focus a planet, zoom toward it, and you sail past the
   * return scale while Earth is off-centre, with the crossing already behind
   * you and no way to trigger it again.
   *
   * Being ABOVE the return scale is enough, provided the handoff body is
   * both the focus and centred. Plain zooming is never blocked by this: every
   * path that does not hand over falls through to the scene's own zoom.
   */
  const tryHandoffBack = useCallback((w: number, h: number, factor: number): boolean => {
    const back = handoffRef.current
    if (!back || !(factor > 1)) return false
    const view = viewRef.current
    /* Only the body the closer scene owns can lead back to it. */
    if (view.focusId !== back.bodyId) return false
    const base = baseScalePxPerM(w, h)
    const after = base * clampZoom(view.zoom * factor)
    if (!(after >= back.returnPxPerMeter)) return false
    const body = sceneRef.current.bodies.find((candidate) => candidate.id === back.bodyId)
    if (!body) return false
    const screen = projectPoint(
      body.posM,
      toCamera(view, w, h, lastCenterRef.current),
      cameraBasis(view.bearingRad, view.tiltRad),
      w,
      h,
    )
    const offsetPx = Math.hypot(screen.x - w / 2, screen.y - h / 2)
    if (offsetPx >= Math.min(w, h) * HANDOFF_CENTERED_FRACTION) return false
    back.onReturn()
    return true
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * factor) }))
  }, [])

  /**
   * The info panel's contents, every figure derived from the shipped physics at
   * the displayed instant. A quantity a body does not have is left out rather
   * than shown empty: the Sun has no orbit, only the Moon has a phase.
   */
  const infoRows = useMemo(() => {
    if (infoId === null) return null
    const rows: [string, string][] = []
    const km = (m: number) => `${Math.round(m / 1000).toLocaleString()} km`
    const duration = (s: number) =>
      s < 7200
        ? `${(s / 60).toFixed(1)} min`
        : s < 2 * 86_400
          ? `${(s / 3600).toFixed(1)} h`
          : s < 2 * 365.25 * 86_400
            ? `${(s / 86_400).toFixed(1)} d`
            : `${(s / (365.25 * 86_400)).toFixed(2)} a`

    if (isSatelliteFocus(infoId)) {
      const wanted = infoId.slice(4)
      const entry = (satellites ?? []).find((candidate) => candidate.id === wanted)
      if (!entry) return null
      rows.push([t('fields.solar_info_altitude'), km(entry.altitudeM)])
      rows.push([t('fields.solar_info_period'), duration(entry.orbitalPeriodS)])
      rows.push([t('fields.solar_info_speed'), `${(entry.speedMs / 1000).toFixed(2)} km/s`])
      return { title: entry.label, rows }
    }

    const facts = bodyFactsAt(infoId, date)
    rows.push([t('fields.solar_info_radius'), km(facts.radiusM)])
    if (facts.distanceM !== null) {
      const label =
        facts.primary === 'earth'
          ? t('fields.solar_info_distance_earth')
          : t('fields.solar_info_distance_sun')
      const au = facts.distanceM / AU
      rows.push([label, `${au < 0.01 ? au.toFixed(5) : au.toFixed(3)} au · ${km(facts.distanceM)}`])
    }
    if (facts.orbitalPeriodS !== null) {
      rows.push([t('fields.solar_info_period'), duration(facts.orbitalPeriodS)])
    }
    if (facts.speedMs !== null) {
      rows.push([t('fields.solar_info_speed'), `${(facts.speedMs / 1000).toFixed(2)} km/s`])
    }
    if (facts.eccentricity !== null) {
      rows.push([t('fields.eccentricity'), facts.eccentricity.toFixed(4)])
    }
    if (facts.inclinationRad !== null) {
      /* Earth's inclination to the ecliptic is zero by definition; without this
         the rounding shows it as "-0.00", which reads as a bug rather than as a
         definition. */
      const degrees = (facts.inclinationRad * 180) / Math.PI
      rows.push([
        t('fields.solar_info_inclination'),
        `${(Object.is(degrees, -0) || Math.abs(degrees) < 0.005 ? 0 : degrees).toFixed(2)}°`,
      ])
    }
    if (facts.rotationPeriodS !== null) {
      rows.push([t('fields.solar_info_rotation'), duration(facts.rotationPeriodS)])
    }
    if (facts.litFraction !== null) {
      rows.push([t('fields.solar_info_lit'), `${(facts.litFraction * 100).toFixed(1)} %`])
    }
    return { title: t(`fields.body_${infoId}`), rows }
  }, [infoId, date, satellites, t])

  /** Nearest drawn body under the pointer, or null for empty sky. */
  const pickAt = useCallback((x: number, y: number): SolarFocusId | null => {
    let best: { id: SolarFocusId; distance: number } | null = null
    for (const target of pickRef.current) {
      const distance = Math.hypot(target.x - x, target.y - y)
      if (distance > target.rPx + PICK_PAD_PX) continue
      if (!best || distance < best.distance) best = { id: target.id, distance }
    }
    return best?.id ?? null
  }, [])

  /** Home: Earth at the default framing, info panel closed. */
  const resetView = useCallback(() => {
    setFocus('earth') // Eases there if we were elsewhere; a no-op if we were not.
    setView((prev) => ({ ...prev, ...VIEW0 }))
    setInfoId(null)
  }, [setFocus])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const w = el.clientWidth
      const h = el.clientHeight
      if (w < 2 || h < 2) return
      /* Zoomed back in to where the closer scene takes over, with its body
         still in the middle of the frame: hand the view back, before any state
         update, since a state updater has to stay free of side effects. */
      if (tryHandoffBack(w, h, wheelZoomFactor(e))) return
      /* A dolly toward the focus, not a zoom about the pointer: the focused
         body is the pivot for everything, so anchoring on the cursor would push
         it off centre. */
      setView((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * wheelZoomFactor(e)) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [tryHandoffBack])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    let raf = 0
    let alive = true

    const draw = () => {
      const ctx = c.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      const h = c.clientHeight
      if (w < 2 || h < 2) return
      if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
        c.width = Math.floor(w * dpr)
        c.height = Math.floor(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      /* A flight owns the zoom while it lasts, then hands the view on. Driven
         here rather than from a timer so it shares the render clock with the
         focus pan and cannot tear against it. */
      const flight = zoomFlightRef.current
      if (flight) {
        const k = Math.min(1, (performance.now() - flight.startedAt) / flight.durationMs)
        const eased = k * k * (3 - 2 * k)
        setView((prev) => ({ ...prev, zoom: flight.from + (flight.to - flight.from) * eased }))
        if (k >= 1) {
          zoomFlightRef.current = null
          flight.onArrive?.()
        }
      }

      const centerM = currentCenterM(viewRef.current.focusId)
      lastCenterRef.current = centerM
      const cam = toCamera(viewRef.current, w, h, centerM)
      const basis: CameraBasis = cameraBasis(cam.bearingRad, cam.tiltRad)
      const project = (p: Vec3) => projectPoint(p, cam, basis, w, h)
      const picks: { id: SolarFocusId; x: number; y: number; rPx: number }[] = []

      ctx.fillStyle = BACKGROUND
      ctx.fillRect(0, 0, w, h)

      const strokePath = (points: Vec3[], color: string, width: number) => {
        if (points.length < 2) return
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = width
        for (let i = 0; i < points.length; i++) {
          const p = project(points[i])
          if (i === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        }
        ctx.stroke()
      }

      const earth = scene.bodies.find((b) => b.id === 'earth')
      const moon = scene.bodies.find((b) => b.id === 'moon')
      const earthScreen = earth ? project(earth.posM) : null
      const moonScreen = moon ? project(moon.posM) : null
      const moonMerged =
        earthScreen != null &&
        moonScreen != null &&
        visible.earth &&
        visible.moon &&
        Math.hypot(moonScreen.x - earthScreen.x, moonScreen.y - earthScreen.y) < MOON_MERGE_PX

      /* A body's own orbit stops being informative once you are close enough to
         see the body itself: 1 au of ellipse crossing a 40 px Earth reads as a
         straight line through it, drawn at whatever angle the camera happens to
         hold, which looks like an artefact rather than an orbit. It is only the
         FOCUSED body's line that does this, so only that one fades. The Moon's
         path around Earth stays: at these scales it is a real, resolvable loop. */
      if (solarDebugRef.current.armed) {
        const sunAt = project([0, 0, 0])
        solarDebugRef.current.camera = {
          focusId: viewRef.current.focusId,
          handoff: handoffRef.current
            ? {
                bodyId: handoffRef.current.bodyId,
                returnPxPerMeter: handoffRef.current.returnPxPerMeter,
              }
            : null,
          bearingRad: cam.bearingRad,
          tiltRad: cam.tiltRad,
          scalePxPerM: cam.scalePxPerM,
          centerM: [cam.centerM[0], cam.centerM[1], cam.centerM[2]],
          widthPx: w,
          heightPx: h,
        }
        const capture = (id: string, points: Vec3[], originScreen: { x: number; y: number }) => {
          let maxM = 0
          let maxPx = 0
          for (const point of points) {
            maxM = Math.max(maxM, Math.hypot(point[0], point[1], point[2]))
            const q = project(point)
            maxPx = Math.max(maxPx, Math.hypot(q.x - originScreen.x, q.y - originScreen.y))
          }
          const step = Math.max(1, Math.floor(points.length / 8))
          const samples = []
          for (let i = 0; i < points.length && samples.length < 8; i += step) {
            const q = project(points[i])
            samples.push({
              posM: [points[i][0], points[i][1], points[i][2]] as [number, number, number],
              screen: { x: q.x, y: q.y },
            })
          }
          return { id, maxRadiusM: maxM, maxRadiusPx: maxPx, samples }
        }
        const captured = scene.orbits.map((orbit) => capture(orbit.id, orbit.points, sunAt))
        const earthAt = scene.bodies.find((b) => b.id === 'earth')
        if (earthAt) captured.push(capture('moon-path', scene.moonPath, project(earthAt.posM)))
        for (const entry of satelliteSceneRef.current) {
          const origin = earthAt ? project(earthAt.posM) : sunAt
          captured.push(capture(`sat:${entry.payload.id}`, entry.ringM, origin))
        }
        solarDebugRef.current.orbits = captured
      }
      for (const orbit of scene.orbits) {
        if (!visible[orbit.id]) continue
        const markerPx = getBody(orbit.id).radius * cam.scalePxPerM
        const alpha =
          orbit.id === viewRef.current.focusId
            ? ORBIT_ALPHA * (1 - smoothstep(ORBIT_FADE_START_PX, ORBIT_FADE_END_PX, markerPx))
            : ORBIT_ALPHA
        if (alpha < 0.005) continue
        strokePath(orbit.points, shade(orbit.color, ORBIT_BRIGHTNESS, alpha), 1)
      }
      if (visible.moon && !moonMerged) {
        strokePath(scene.moonPath, shade(getBody('moon').color, ORBIT_BRIGHTNESS, ORBIT_ALPHA), 1)
      }

      /* The tool's satellite, once its ring is big enough to be a ring. Below
         that it would just thicken Earth's marker. */
      const drawnSatellites: { entry: (typeof satelliteSceneRef.current)[number]; screen: ReturnType<typeof project> }[] = []
      for (const entry of satelliteSceneRef.current) {
        if (entry.orbitRadiusM * cam.scalePxPerM <= SATELLITE_RING_MIN_PX) continue
        strokePath(entry.ringM, shade(entry.payload.color, 1, 0.5), 1)
        const screen = project(entry.posM)
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, MIN_MARKER_PX, 0, TAU)
        ctx.fillStyle = entry.payload.color
        ctx.fill()
        picks.push({
          id: satelliteFocusId(entry.payload.id),
          x: screen.x,
          y: screen.y,
          rPx: MIN_MARKER_PX,
        })
        drawnSatellites.push({ entry, screen })
      }

      const sunScreenPos = project([0, 0, 0])
      const sunRadiusPx = Math.max(MIN_MARKER_PX, getBody('sun').radius * cam.scalePxPerM)

      const drawn = scene.bodies
        .filter((b) => visible[b.id] && !(b.id === 'moon' && moonMerged))
        .map((body) => ({ body, screen: project(body.posM) }))
        .sort((a, b) => a.screen.depth - b.screen.depth)

      for (const { body, screen } of drawn) {
        const truePx = body.radiusM * cam.scalePxPerM
        const rPx = Math.max(MIN_MARKER_PX, truePx)
        picks.push({ id: body.id, x: screen.x, y: screen.y, rPx })

        if (body.id === 'sun') {
          /* The glow is a fixed halo, never a scaled radius: at true scale the
             Sun's disk has to speak for itself. */
          const glowPx = rPx + 8
          const glow = ctx.createRadialGradient(screen.x, screen.y, rPx, screen.x, screen.y, glowPx)
          glow.addColorStop(0, shade(body.color, 1, 0.45))
          glow.addColorStop(1, shade(body.color, 1, 0))
          ctx.beginPath()
          ctx.arc(screen.x, screen.y, glowPx, 0, TAU)
          ctx.fillStyle = glow
          ctx.fill()

          const core = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, rPx)
          core.addColorStop(0, '#fff6e0')
          core.addColorStop(1, body.color)
          ctx.beginPath()
          ctx.arc(screen.x, screen.y, rPx, 0, TAU)
          ctx.fillStyle = core
          ctx.fill()
          continue
        }

        const sun = sunDirectionInView(body.posM, basis)
        const phase = phaseGeometry(sun, rPx)
        const litColor = body.color
        const nightColor = shade(body.color, NIGHT_BRIGHTNESS)

        if (rPx < PHASE_MIN_PX) {
          ctx.beginPath()
          ctx.arc(screen.x, screen.y, rPx, 0, TAU)
          ctx.fillStyle = litColor
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(screen.x, screen.y, rPx, 0, TAU)
          ctx.fillStyle = phase.headOn && phase.litFraction > 0.5 ? litColor : nightColor
          ctx.fill()

          if (!phase.headOn) {
            /* Lit hemisphere: the sunward half of the limb, closed by the
               terminator ellipse. The terminator's semi-axis along the Sun
               direction is |terminatorMidPx|; its sign says which side of the
               disk centre it falls on, which is the whole phase. */
            const crescent = phase.terminatorMidPx > 0
            ctx.beginPath()
            ctx.ellipse(
              screen.x,
              screen.y,
              rPx,
              rPx,
              phase.sunAngleRad,
              -Math.PI / 2,
              Math.PI / 2,
            )
            ctx.ellipse(
              screen.x,
              screen.y,
              Math.abs(phase.terminatorMidPx),
              rPx,
              phase.sunAngleRad,
              Math.PI / 2,
              crescent ? -Math.PI / 2 : (3 * Math.PI) / 2,
              crescent,
            )
            ctx.closePath()
            ctx.fillStyle = litColor
            ctx.fill()
          }

          ctx.beginPath()
          ctx.arc(screen.x, screen.y, rPx, 0, TAU)
          ctx.strokeStyle = 'rgba(255,255,255,0.14)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        if (rPx < AXIS_MIN_PX) continue

        const pole = directionInView(poleDirectionEcliptic(body.orientation), basis)
        const axisLen = Math.hypot(pole.x, pole.y)
        // A pole pointing straight at the camera has no direction on screen.
        if (axisLen < 1e-3) continue
        const ux = pole.x / axisLen
        const uy = pole.y / axisLen
        // Length 1.5 disk diameters, so the axis reads outside the limb.
        const half = rPx * 1.5
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,245,245,0.55)'
        ctx.lineWidth = 1
        ctx.moveTo(screen.x - ux * half, screen.y - uy * half)
        ctx.lineTo(screen.x + ux * half, screen.y + uy * half)
        ctx.stroke()

        /* Prime meridian: the surface point where it crosses the equator,
           marked with a short stroke along the meridian. Hidden when W has
           carried it round to the far side. */
        const meridian = directionInView(primeMeridianDirectionEcliptic(body.orientation), basis)
        if (meridian.z < 0) continue
        const mx = screen.x + meridian.x * rPx
        const my = screen.y + meridian.y * rPx
        const tick = rPx * 0.28
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(245,245,245,0.8)'
        ctx.lineWidth = 1
        ctx.moveTo(mx - ux * tick, my - uy * tick)
        ctx.lineTo(mx + ux * tick, my + uy * tick)
        ctx.stroke()
      }

      ctx.font = LABEL_FONT
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      for (const { body, screen } of drawn) {
        if (screen.x < -80 || screen.x > w + 80 || screen.y < -40 || screen.y > h + 40) continue
        const label =
          body.id === 'earth' && moonMerged
            ? t('fields.body_earth_moon')
            : t(`fields.body_${body.id}`)
        /* A body on the far side of the Sun is already covered by the Sun's
           disk; its label has to dim to match. */
        const behindSun =
          visible.sun &&
          body.id !== 'sun' &&
          screen.depth < sunScreenPos.depth &&
          Math.hypot(screen.x - sunScreenPos.x, screen.y - sunScreenPos.y) < sunRadiusPx
        ctx.globalAlpha = behindSun ? 0.3 : 1
        const rPx = Math.max(MIN_MARKER_PX, body.radiusM * cam.scalePxPerM)
        const tx = screen.x + rPx + 5
        const ty = screen.y - rPx - 3
        ctx.strokeStyle = BACKGROUND
        ctx.lineWidth = 3
        ctx.strokeText(label, tx, ty)
        ctx.fillStyle = shade(body.color, 1, 0.95)
        ctx.fillText(label, tx, ty)
        ctx.globalAlpha = 1
      }

      /* Names only while there are few enough to read; past that the rings and
         markers carry the population and a name per satellite is a smear. */
      if (drawnSatellites.length <= SATELLITE_LABEL_MAX) {
        ctx.globalAlpha = 1
        for (const { entry, screen } of drawnSatellites) {
          ctx.strokeStyle = BACKGROUND
          ctx.lineWidth = 3
          ctx.strokeText(entry.payload.label, screen.x + 6, screen.y - 5)
          ctx.fillStyle = shade(entry.payload.color, 1, 0.95)
          ctx.fillText(entry.payload.label, screen.x + 6, screen.y - 5)
        }
      }

      pickRef.current = picks
    }

    const tick = () => {
      if (!alive) return
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [scene, visible, t])

  return (
    <div
      className={cn(
        'relative h-full min-h-0 w-full flex-1 overflow-hidden bg-bg',
        className,
      )}
      style={height != null ? { minHeight: height } : undefined}
      data-viz="solar-system"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('fields.scene_solar')}
        className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
          const v = viewRef.current
          drag.current = { x: e.clientX, y: e.clientY, bearing: v.bearingRad, tilt: v.tiltRad }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          /* Orbiting the focus, not panning: the focus stays at the centre and
             the camera swings around it, so there is no way to lose the body
             you are looking at. */
          if (Math.hypot(dx, dy) <= CLICK_SLOP_PX) return
          setView((prev) => ({
            ...prev,
            bearingRad: drag.current!.bearing + dx * 0.01,
            tiltRad: Math.min(1.55, Math.max(0.02, drag.current!.tilt + dy * 0.01)),
          }))
        }}
        onPointerUp={(e) => {
          const start = drag.current
          drag.current = null
          if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX) return
          const rect = e.currentTarget.getBoundingClientRect()
          const hit = pickAt(e.clientX - rect.left, e.clientY - rect.top)
          if (!hit) {
            setInfoId(null) // Empty sky: dismiss, leave the focus alone.
            return
          }
          // Clicking what is already focused hands the view back to Earth.
          setFocus(hit === viewRef.current.focusId ? 'earth' : hit)
          setInfoId(hit)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onDoubleClick={resetView}
      />

      <div className="absolute left-4 top-16 z-10 flex flex-col gap-1 border border-border bg-bg/80 px-2 py-1.5 backdrop-blur-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {t('fields.solar_bodies')}
        </p>
        {BODY_IDS.map((id) => (
          <label
            key={id}
            className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-subtle transition-colors hover:text-fg"
          >
            <input
              type="checkbox"
              checked={visible[id]}
              onChange={(e) =>
                setVisible((prev) => ({ ...prev, [id]: e.target.checked }))
              }
              className="cursor-pointer accent-warn"
            />
            {t(`fields.body_${id}`)}
          </label>
        ))}
      </div>

      {infoRows ? (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 mb-[6.5rem] w-fit min-w-[13rem] max-w-[min(22rem,calc(100%-11rem))] border border-border bg-bg/90 px-2.5 py-2 backdrop-blur-sm">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-fg">
            {infoRows.title}
          </p>
          {infoRows.rows.map(([label, value]) => (
            <p key={label} className="flex justify-between gap-4 font-mono text-[10px] text-subtle">
              <span className="text-muted">{label}</span>
              <span className="tabular">{value}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-[min(38rem,calc(100%-11rem))] flex-col gap-1">
        <p className="font-mono text-[10px] tabular text-muted">{utcStamp(date)}</p>
        <p className="font-mono text-[10px] leading-relaxed text-subtle">{t('fields.solar_hint')}</p>
        <p className="font-mono text-[10px] leading-relaxed text-subtle">
          {t('fields.solar_scale_note')}
        </p>
        <p className="font-mono text-[10px] leading-relaxed text-subtle">
          {t('fields.solar_caption')}
        </p>
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1">
        <span className="rounded border border-border/80 bg-bg/80 px-1.5 py-0.5 font-mono text-[10px] tabular text-muted backdrop-blur-sm">
          {view.zoom >= 10 ? Math.round(view.zoom) : view.zoom.toFixed(2)}x
        </span>
        <div className="flex items-center gap-0.5 rounded border border-border/80 bg-bg/85 p-0.5 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            aria-label={t('common.zoom_in')}
            onClick={() => zoomBy(1.5)}
            {...tooltipProps(
              t('common.zoom_in'),
              'inline-flex size-6 items-center justify-center text-muted transition-colors hover:bg-surface hover:text-fg',
              'above-end',
            )}
          >
            <Plus size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('common.zoom_out')}
            onClick={() => zoomBy(1 / 1.5)}
            {...tooltipProps(
              t('common.zoom_out'),
              'inline-flex size-6 items-center justify-center text-muted transition-colors hover:bg-surface hover:text-fg',
              'above-end',
            )}
          >
            <Minus size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('common.reset_view')}
            onClick={resetView}
            {...tooltipProps(
              t('common.reset_view'),
              'inline-flex size-6 items-center justify-center text-muted transition-colors hover:bg-surface hover:text-fg',
              'above-end',
            )}
          >
            <RotateCcw size={13} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
