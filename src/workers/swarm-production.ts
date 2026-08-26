/**
 * The swarm's propagation work, separated from the worker that hosts it.
 *
 * It lives outside the worker entry so it can be run and measured directly,
 * which matters more here than usual: a real catalogue is not a tidy set of
 * healthy orbits, and the only honest way to know how this behaves against
 * decaying objects and stale epochs is to feed it some.
 *
 * ## Isolation is the contract
 *
 * Every satellite is propagated inside its own guard. A catalogue carries
 * objects that are decaying, sub-orbital, or simply too old to propagate, and
 * one of them must never be able to cost the other ten thousand their frame.
 * A satellite that fails is SKIPPED, never drawn, and counted; the batch always
 * completes and the caller always gets an answer.
 *
 * ## Identity is the slot
 *
 * Packed slot k is satrec k. A satellite that fails to propagate, or that the
 * full-treatment path already draws, leaves that slot empty (NaN). Compacting
 * the survivors would make every later Starlink inherit its neighbour's pixel
 * the next time a different object failed, which is the flicker of dots
 * appearing and vanishing at random.
 */

import { eciSiToGeodetic, parseTle, propagateEci } from '@/lib/physics'
import { lonLatToMercator } from '@/components/viz/globe/track'
import type { SatRec } from 'satellite.js'
import {
  packEmptySwarmSample,
  packSwarmSample,
  SWARM_FLOATS_PER_SATELLITE,
  type SwarmTle,
} from '@/components/viz/globe/swarm'
import {
  packSwarmTrail,
  SWARM_TRAIL_FLOATS_PER_SATELLITE,
  SWARM_TRAIL_POINTS,
  type SwarmTrailPoint,
} from '@/components/viz/globe/swarm-trails'

/**
 * Mercator of a lon/lat. Globe trails are allowed past web-mercator ±85° so
 * polar orbits can reach the pole instead of sliding on that parallel.
 */
export function toMercator(lonDeg: number, latDeg: number): { mercatorX: number; mercatorY: number } {
  const { x, y } = lonLatToMercator(lonDeg, latDeg)
  return { mercatorX: x, mercatorY: y }
}

/** Sample at `propagateAt`, converted with Greenwich angle of `frameAt`. */
function sampleAt(satrec: SatRec, propagateAt: Date, frameAt: Date = propagateAt): SwarmTrailPoint | null {
  try {
    const state = propagateEci(satrec, propagateAt)
    if (!state) return null
    const geo = eciSiToGeodetic(state.r, frameAt)
    if (!geo) return null
    return { ...toMercator(geo.lonDeg, geo.latDeg), elevationM: geo.heightM }
  } catch {
    return null
  }
}

export type SwarmLoadResult = {
  satrecs: SatRec[]
  /** Catalogue numbers of the accepted sets, in satrec order. */
  accepted: string[]
  /** Each accepted satellite's own colour, in the same order. */
  colors: [number, number, number][]
  rejected: string[]
}

/** Parses a catalogue, keeping the accepted order recoverable. */
export function loadSwarmSatrecs(tles: readonly SwarmTle[]): SwarmLoadResult {
  const satrecs: SatRec[] = []
  const accepted: string[] = []
  const colors: [number, number, number][] = []
  const rejected: string[] = []
  for (const tle of tles) {
    let ok = false
    try {
      const result = parseTle(`${tle.catnr}\n${tle.line1}\n${tle.line2}`)
      if (result.ok) {
        satrecs.push(result.satrec)
        accepted.push(tle.catnr)
        colors.push(tle.rgb)
        ok = true
      }
    } catch {
      ok = false
    }
    if (!ok) rejected.push(tle.catnr)
  }
  return { satrecs, accepted, colors, rejected }
}

export type KeyframeProduct = {
  count: number
  /** Packed slot k is satrec k. */
  indices: Uint32Array
  skipped: number
}

function holdOrEmpty(packed: Float32Array, index: number, previous?: Float32Array): void {
  const at = index * SWARM_FLOATS_PER_SATELLITE
  if (previous && Number.isFinite(previous[at])) {
    packed[at] = previous[at] + previous[at + 3]
    packed[at + 1] = previous[at + 1] + previous[at + 4]
    packed[at + 2] = previous[at + 2] + previous[at + 5]
    packed[at + 3] = 0
    packed[at + 4] = 0
    packed[at + 5] = 0
    packed[at + 6] = previous[at + 6]
    packed[at + 7] = previous[at + 7]
    packed[at + 8] = previous[at + 8]
    return
  }
  packEmptySwarmSample(packed, index)
}

/**
 * Fills `packed` with one slot per satrec. Failures and `skipIndex` leave that
 * slot empty (or held from `previous`) so later satellites keep their index.
 *
 * `inertial` converts both ends with the Greenwich angle of `freezeMs` (or
 * the start epoch) so GPU interpolation stays on the frozen ellipse.
 */
export function produceKeyframe(
  satrecs: readonly SatRec[],
  colors: readonly [number, number, number][],
  epochMs: number,
  spanMs: number,
  packed: Float32Array,
  indices: Uint32Array,
  inertial = false,
  freezeMs?: number,
  skipIndex?: number,
  previous?: Float32Array,
): KeyframeProduct {
  const start = new Date(epochMs)
  const end = new Date(epochMs + spanMs)
  const frame = inertial ? new Date(freezeMs ?? epochMs) : null
  let skipped = 0
  for (let i = 0; i < satrecs.length; i++) {
    indices[i] = i
    if (i === skipIndex) {
      packEmptySwarmSample(packed, i)
      skipped++
      continue
    }
    const a = sampleAt(satrecs[i], start, frame ?? start)
    const b = a ? sampleAt(satrecs[i], end, frame ?? end) : null
    if (!a || !b) {
      holdOrEmpty(packed, i, previous)
      skipped++
      continue
    }
    packSwarmSample(packed, i, a, b, colors[i] ?? [1, 1, 1])
  }
  return { count: satrecs.length, indices, skipped }
}

/**
 * A satellite's trail, sampled at the trail resolution.
 *
 * `revolutions` is how far it reaches EITHER SIDE of `atMs`, so 0.5 is one
 * revolution centred on now and 1.5 is the long triple loop a lone satellite
 * gets. It comes from the count rule in appearance.ts and from nowhere else.
 */
function trailOf(
  satrec: SatRec,
  atMs: number,
  revolutions: number,
  freezeMs: number | null,
): (SwarmTrailPoint | null)[] {
  const points: (SwarmTrailPoint | null)[] = []
  /* A satellite whose mean motion is not a usable number has no period to
     sample over; it contributes an empty trail rather than an infinite loop. */
  const periodMs = ((2 * Math.PI) / satrec.no) * 60_000
  if (!Number.isFinite(periodMs) || periodMs <= 0) return points
  const spanMs = periodMs * revolutions * 2
  const frameAt = freezeMs != null ? new Date(freezeMs) : null
  for (let i = 0; i < SWARM_TRAIL_POINTS; i++) {
    const offset = -spanMs / 2 + (spanMs * i) / (SWARM_TRAIL_POINTS - 1)
    const at = new Date(atMs + offset)
    points.push(sampleAt(satrec, at, frameAt ?? at))
  }
  return points
}

/**
 * Fills `packed` with one batch of trails. A satellite that cannot be sampled
 * leaves its slot as degenerate pairs, which draw nothing: the slot is still
 * ITS slot, so trail index stays satrec index.
 */
export function produceTrailBatch(
  satrecs: readonly SatRec[],
  colors: readonly [number, number, number][],
  startIndex: number,
  count: number,
  atMs: number,
  revolutions: number,
  packed: Float32Array,
  inertial = false,
  freezeMs?: number,
  skipIndex?: number,
): { skipped: number } {
  let skipped = 0
  const freeze = inertial ? (freezeMs ?? atMs) : null
  const empty: (SwarmTrailPoint | null)[] = []
  for (let i = 0; i < count; i++) {
    const satrecIndex = startIndex + i
    const points =
      satrecIndex === skipIndex
        ? empty
        : trailOf(satrecs[satrecIndex], atMs, revolutions, freeze)
    if (points.length === 0 || points.every((point) => point === null)) skipped++
    packSwarmTrail(packed, i, points, colors[satrecIndex] ?? [1, 1, 1])
  }
  return { skipped }
}

export const SWARM_KEYFRAME_FLOATS_PER_SATELLITE = SWARM_FLOATS_PER_SATELLITE
export const SWARM_TRAIL_FLOATS = SWARM_TRAIL_FLOATS_PER_SATELLITE
