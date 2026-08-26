/**
 * The home page's live globe: the tool's own swarm pipeline, pointed at a
 * small bundled LEO set, with no interactive chrome. A default export, so
 * the section around it can `React.lazy` this file and keep MapLibre out of
 * the home's own bundle.
 */

import { memo, useEffect, useMemo, useState } from 'react'
import { GlobeMap } from '@/components/viz/GlobeMap'
import { parseCssRgba } from '@/components/viz/globe/color'
import { satelliteColorAt } from '@/components/viz/globe/style'
import type { SwarmTle } from '@/components/viz/globe/swarm'
import type { GlobeSatellite } from '@/components/viz/globe/types'
import type { SkyBody } from '@/components/viz/globe/celestial'
import { catnrOf, parseTleRecords, type TleRecord } from '@/lib/celestrak'
import { useSatelliteSwarm } from '@/lib/use-satellite-swarm'
import { eciSiToGeodetic, SAMPLE_ISS_TLE, sunEciSi } from '@/lib/physics'
import { DEMO_FALLBACK_TLE } from './demo-tle-fallback'

const NO_SATELLITES: GlobeSatellite[] = []
const NO_SKY_BODIES: SkyBody[] = []

/** Subsolar point recomputed on the same cadence the tool page uses. */
const SUBSOLAR_TICK_MS = 60_000
/**
 * The demo is a crowd view by design, not a single-satellite chase: half a
 * revolution across the swarm's fixed 96-sample budget keeps every segment
 * under two degrees. Deriving this from the population count instead (as
 * OrbitalViewTool's `trailRevolutionsFor` does for a real selection) would
 * give a tiny fallback the lone-satellite 1.5-revolution treatment, stretching
 * those same 96 samples into eleven-degree chords that read as dashed and pop
 * at the limb while the camera auto-rotates.
 */
const DEMO_TRAIL_REVOLUTIONS = 0.5
/** Small enough that dots and trails land with the first keyframe. */
const DEMO_MAX_SATS = 8
/** Mean motion (rev/day) for LEO. GEO sits near 1 and draws at 6 Earth radii. */
const LEO_N_MIN = 11
const LEO_N_MAX = 17
const SKIP_NAME = /\b(?:R\/B|DEB|STARLINK)\b/i

function tickedSolarInstantMs(): number {
  return Math.floor(Date.now() / SUBSOLAR_TICK_MS) * SUBSOLAR_TICK_MS
}

/** Same conversion OrbitalViewTool assigns per selected satellite. */
function swarmRgbAt(index: number): [number, number, number] {
  const [red, green, blue] = parseCssRgba(satelliteColorAt(index))
  return [red, green, blue]
}

/** TLE line 2 mean motion, revolutions per day (columns 53–63). */
function meanMotionRevPerDay(line2: string): number {
  return Number.parseFloat(line2.slice(52, 63))
}

/**
 * GEO (n ≈ 1) at true altitude is six Earth radii out: a half-orbit trail
 * becomes a meridian that shoots off the globe. Keep LEO payloads only.
 */
function isLeoPayload(record: TleRecord): boolean {
  const n = meanMotionRevPerDay(record.line2)
  if (!(n > LEO_N_MIN && n < LEO_N_MAX)) return false
  return !SKIP_NAME.test(record.name)
}

function swarmFromRecords(records: TleRecord[]): SwarmTle[] {
  return records
    .filter(isLeoPayload)
    .slice(0, DEMO_MAX_SATS)
    .map((record, index) => ({
      catnr: record.catnr,
      line1: record.line1,
      line2: record.line2,
      rgb: swarmRgbAt(index),
    }))
}

/**
 * The bundled snapshot. Falls back further, to the single sample ISS TLE,
 * only if the bundle itself somehow fails to parse.
 */
function fallbackSwarm(): SwarmTle[] {
  const picked = swarmFromRecords(parseTleRecords(DEMO_FALLBACK_TLE))
  if (picked.length > 0) return picked
  const [, line1, line2] = SAMPLE_ISS_TLE.split('\n')
  return [{ catnr: catnrOf(line1), line1, line2, rgb: swarmRgbAt(0) }]
}

/** Parsed once when the lazy chunk loads, so the worker has TLEs immediately. */
const DEMO_SWARM: SwarmTle[] = fallbackSwarm()

function OrbitalDemoGlobe() {
  const [solarInstantMs, setSolarInstantMs] = useState(tickedSolarInstantMs)
  useEffect(() => {
    const id = window.setInterval(() => setSolarInstantMs(tickedSolarInstantMs()), SUBSOLAR_TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  const subsolar = useMemo(() => {
    const date = new Date(solarInstantMs)
    const geo = eciSiToGeodetic(sunEciSi(date), date)
    return geo ? { latDeg: geo.latDeg, lonDeg: geo.lonDeg } : { latDeg: 0, lonDeg: 0 }
  }, [solarInstantMs])

  const {
    keyframe: swarmKeyframe,
    status: swarmStatus,
    trailBatch: swarmTrailBatch,
  } = useSatelliteSwarm(
    DEMO_SWARM,
    DEMO_TRAIL_REVOLUTIONS,
    /* refreshCatnr */ null,
    /* produceTrails */ true,
    /* loopTrails */ false,
    /* inertialTrails */ true,
  )

  return (
    <GlobeMap
      chrome={false}
      autoRotateDegPerS={1.5}
      initialCenter={[0, 0]}
      showAltitude
      swarmPointSizePx={6}
      satellites={NO_SATELLITES}
      skyBodies={NO_SKY_BODIES}
      showSun
      subsolar={subsolar}
      swarmKeyframe={swarmKeyframe}
      swarmIds={swarmStatus.ids}
      swarmTrailBatch={swarmTrailBatch}
      swarmTrailCount={swarmStatus.count}
      swarmTrailOnlySelected={false}
      swarmTrailProgress={null}
      showSatelliteLabels={false}
    />
  )
}

export default memo(OrbitalDemoGlobe)
