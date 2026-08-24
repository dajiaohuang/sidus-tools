/**
 * Projection and pick introspection for verification, dev builds only.
 *
 * The scenes draw to a canvas, so nothing a test can query describes where a
 * body actually landed or what a click would have hit. Rather than add and
 * remove a temporary hook every time a measurement is needed, this is the one
 * place that exposes it, behind two locks:
 *
 *   - `import.meta.env.DEV`, which Vite replaces with a literal `false` in a
 *     production build, so every call site below becomes dead code and the
 *     dynamic import of this module is never emitted;
 *   - `?debug=proj` in the URL, so a dev session that has not asked for it
 *     pays nothing and exposes nothing.
 *
 * Both locks live at the CALL SITES rather than in a function here, so that a
 * production build holds no import of this module at all and the chunk is
 * never emitted, which is checkable against dist/.
 *
 * The API is deliberately read-only: it reports what the scene decided, and
 * cannot change it. Anything a caller could use to drive the view belongs in
 * the component, not here.
 */

/** What a scene reports about a click target it drew. */
export type DebugPick = {
  id: string
  x: number
  y: number
  rPx: number
}

/** One trail as drawn: how many points it has and its worst on-screen chord. */
export type DebugTrail = {
  id: string
  points: number
  maxChordPx: number
  /** How far the drawn line departs from the true path, in pixels. */
  maxSagittaPx: number
  settled: boolean
}

/** A point on the globe, projected exactly as the elevated layer draws it. */
export type DebugScreenPoint = { x: number; y: number }

/**
 * The camera parameters an independent pinhole model needs. Deliberately NOT
 * the projection matrices: a check built from these tests the projection,
 * whereas one built from the matrices would only test itself.
 */
export type DebugCamera = {
  fovRad: number
  widthPx: number
  heightPx: number
  centerLon: number
  centerLat: number
  bearingDeg: number
  pitchDeg: number
  zoom: number
}

/** A sky body as the globe drew it this frame. */
export type DebugSkyBody = {
  id: string
  atMs: number
  /** True apparent angular diameter, degrees. */
  angularDiameterDeg: number
  /** Diameter the projection gives it, before any minimum-dot floor. */
  truePx: number
  /** Diameter actually drawn, after the floor and any hover growth. */
  drawnPx: number
  screen: DebugScreenPoint | null
  /** Unit direction in the globe's world frame, for rate measurements. */
  direction: [number, number, number]
}

/** A satellite marker as the page currently has it: geodetic state and where it lands. */
export type DebugSatellite = {
  id: string
  atMs: number
  lon: number
  lat: number
  altKm: number
  screen: DebugScreenPoint | null
}

/** One swarm pick, with the work it took to reach the answer. */
export type DebugSwarmPick = {
  id: string | null
  /** Segments the grid handed to the exact stage. */
  candidates: number
  /** Points projected in total, dots and candidate endpoints together. */
  projections: number
  ms: number
  occupancy: { cells: number; entries: number; mean: number; max: number }
}

export type SidusDebugApi = {
  /** Everything the solar scene would let a click land on, in canvas pixels. */
  solarPicks: () => DebugPick[]
  /** Earth's drawn radius on the globe, in CSS pixels, or null before a frame. */
  globeRadiusPx: () => number | null
  /** Every drawn trail's worst chord, the measure the refinement targets. */
  globeTrails: () => DebugTrail[]
  /**
   * Where the globe puts a geodetic point at altitude, in CSS pixels, through
   * the same chain the elevated layer draws with. Null when the point is off
   * the globe or before the first frame.
   */
  globeProject: (lonDeg: number, latDeg: number, altKm: number) => DebugScreenPoint | null
  /** Screen centre of the globe canvas, the origin every standoff is measured from. */
  globeCenter: () => DebugScreenPoint | null
  /** Every drawn satellite's live geodetic position and its drawn screen point. */
  globeSatellites: () => DebugSatellite[]
  /** Camera parameters for an independent pinhole reconstruction. */
  globeCamera: () => DebugCamera | null
  /** Per-frame swarm interpolation record, once armed. */
  swarmTrace: () => { tMs: number; raw: number; progress: number; epochMs: number; spanMs: number }[]
  /** Which drawn layers exist, for structural checks that must not read pixels. */
  globeLayers: () => {
    swarm: boolean
    trails: number
    labels: number
    /** The one-draw-call trail layer, and how many trails have arrived in it. */
    swarmTrails: boolean
    swarmTrailsFilled: number
  }
  /** Sun, Moon and planets as the last frame drew them. */
  globeSkyBodies: () => DebugSkyBody[]
  /**
   * Runs the swarm pick at a canvas point and reports what it found ALONGSIDE
   * what it cost, so the prune can be measured rather than trusted.
   */
  globeSwarmPick: (x: number, y: number) => DebugSwarmPick
  /**
   * Every `step`-th swarm dot as the last frame drew it, so a pick can be
   * checked against a position the page produced rather than one a test guessed.
   */
  globeSwarmDots: (step: number) => { id: string; index: number; screen: DebugScreenPoint }[]
  /**
   * The same ephemeris the page draws with, evaluated at an instant the caller
   * chooses. The drawn billboards only refresh once a minute, so a rate read
   * off two frames measures the tick and not the sky; this measures the sky.
   */
  globeSkyDirectionAt: (id: string, timeMs: number) => [number, number, number] | null
  /** The solar scene's camera, never its projection function. */
  solarCamera: () => DebugSolarCamera | null
  /** Each drawn orbit's true and on-screen extent from the Sun. */
  solarOrbits: () => DebugSolarOrbit[]
  /**
   * The scene's own ephemeris at an instant the caller chooses. The scene only
   * advances on a minute tick, so a rate read off two frames measures the tick.
   */
  solarBodyPositionAt: (id: string, timeMs: number) => [number, number, number] | null
}

/** The solar scene's orthographic camera, for an independent reconstruction. */
export type DebugSolarCamera = {
  /** Which body the camera is locked to, for return-path diagnosis. */
  focusId: string
  /** The closer scene's return contract, or null when there is none to go back to. */
  handoff: { bodyId: string; returnPxPerMeter: number } | null
  bearingRad: number
  tiltRad: number
  scalePxPerM: number
  centerM: [number, number, number]
  widthPx: number
  heightPx: number
}

/** One drawn orbit: its true extent in metres, its screen extent, and samples. */
export type DebugSolarOrbit = {
  id: string
  maxRadiusM: number
  maxRadiusPx: number
  /**
   * A handful of points as drawn: world metres beside the pixel the scene put
   * them on, so a caller can reconstruct each one from the camera parameters
   * and check the projection point by point rather than in aggregate.
   */
  samples: { posM: [number, number, number]; screen: { x: number; y: number } }[]
}

type Registry = {
  solarPicks?: () => DebugPick[]
  globeRadiusPx?: () => number | null
  globeTrails?: () => DebugTrail[]
  globeProject?: (lonDeg: number, latDeg: number, altKm: number) => DebugScreenPoint | null
  globeCenter?: () => DebugScreenPoint | null
  globeSatellites?: () => DebugSatellite[]
  globeCamera?: () => DebugCamera | null
  swarmTrace?: () => { tMs: number; raw: number; progress: number; epochMs: number; spanMs: number }[]
  globeLayers?: () => {
    swarm: boolean
    trails: number
    labels: number
    swarmTrails: boolean
    swarmTrailsFilled: number
  }
  globeSkyBodies?: () => DebugSkyBody[]
  globeSwarmPick?: (x: number, y: number) => DebugSwarmPick
  globeSwarmDots?: (step: number) => { id: string; index: number; screen: DebugScreenPoint }[]
  globeSkyDirectionAt?: (id: string, timeMs: number) => [number, number, number] | null
  solarCamera?: () => DebugSolarCamera | null
  solarOrbits?: () => DebugSolarOrbit[]
  solarBodyPositionAt?: (id: string, timeMs: number) => [number, number, number] | null
}

const registry: Registry = {}

/**
 * Publishes the reader on `window.__sidusDebug`. Safe to call repeatedly: a
 * scene that remounts re-registers its own reader and leaves the others alone.
 */
export function registerDebugProjection(part: Registry): void {
  Object.assign(registry, part)
  const api: SidusDebugApi = {
    solarPicks: () => registry.solarPicks?.() ?? [],
    globeRadiusPx: () => registry.globeRadiusPx?.() ?? null,
    globeTrails: () => registry.globeTrails?.() ?? [],
    globeProject: (lonDeg, latDeg, altKm) =>
      registry.globeProject?.(lonDeg, latDeg, altKm) ?? null,
    globeCenter: () => registry.globeCenter?.() ?? null,
    globeSatellites: () => registry.globeSatellites?.() ?? [],
    globeCamera: () => registry.globeCamera?.() ?? null,
    swarmTrace: () => registry.swarmTrace?.() ?? [],
    globeLayers: () =>
      registry.globeLayers?.() ?? {
        swarm: false,
        trails: 0,
        labels: 0,
        swarmTrails: false,
        swarmTrailsFilled: 0,
      },
    globeSkyBodies: () => registry.globeSkyBodies?.() ?? [],
    globeSwarmDots: (step) => registry.globeSwarmDots?.(step) ?? [],
    globeSwarmPick: (x, y) =>
      registry.globeSwarmPick?.(x, y) ?? {
        id: null,
        candidates: 0,
        projections: 0,
        ms: 0,
        occupancy: { cells: 0, entries: 0, mean: 0, max: 0 },
      },
    globeSkyDirectionAt: (id, timeMs) => registry.globeSkyDirectionAt?.(id, timeMs) ?? null,
    solarCamera: () => registry.solarCamera?.() ?? null,
    solarOrbits: () => registry.solarOrbits?.() ?? [],
    solarBodyPositionAt: (id, timeMs) => registry.solarBodyPositionAt?.(id, timeMs) ?? null,
  }
  ;(window as unknown as { __sidusDebug?: SidusDebugApi }).__sidusDebug = api
}
