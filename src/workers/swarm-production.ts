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
 * ## Identity survives the skipping
 *
 * Because failures are skipped, packed slot k is NOT satellite k. The keyframe
 * therefore carries `indices`, mapping each packed slot back to the satellite
 * that filled it, and loading reports the ACCEPTED catalogue numbers in order.
 * Without those two, a catalogue containing a single unparsable element set
 * would silently shift every name, every trail and every pick by one.
 */

import { eciSiToGeodetic, parseTle, propagateEci } from '@/lib/physics'
import type { SatRec } from 'satellite.js'
import { packSwarmSample, SWARM_FLOATS_PER_SATELLITE, type SwarmTle } from '@/components/viz/globe/swarm'
import {
  packSwarmTrail,
  SWARM_TRAIL_FLOATS_PER_SATELLITE,
  SWARM_TRAIL_POINTS,
  type SwarmTrailPoint,
} from '@/components/viz/globe/swarm-trails'

const DEG_TO_MERCATOR_X = 1 / 360
const RAD = Math.PI / 180

/**
 * Mercator coordinates of a lon/lat, matching MapLibre's own convention: x and
 * y both run 0..1 over the world, y measured from the north edge.
 */
export function toMercator(lonDeg: number, latDeg: number): { mercatorX: number; mercatorY: number } {
  const clampedLat = Math.max(-85.051129, Math.min(85.051129, latDeg))
  const sin = Math.sin(clampedLat * RAD)
  return {
    mercatorX: lonDeg * DEG_TO_MERCATOR_X + 0.5,
    mercatorY: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  }
}

/** Earth-fixed sample, for the live keyframe positions. */
function sampleAt(satrec: SatRec, date: Date): SwarmTrailPoint | null {
  try {
    const state = propagateEci(satrec, date)
    if (!state) return null
    const geo = eciSiToGeodetic(state.r, date)
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
  /** Packed slot k holds the satellite at satrec index `indices[k]`. */
  indices: Uint32Array
  skipped: number
}

/**
 * Fills `packed` with the start/delta pair for every satellite that propagates
 * at BOTH instants. One that does not is skipped rather than guessed at, and
 * the count says how many.
 */
export function produceKeyframe(
  satrecs: readonly SatRec[],
  colors: readonly [number, number, number][],
  epochMs: number,
  spanMs: number,
  packed: Float32Array,
  indices: Uint32Array,
): KeyframeProduct {
  const start = new Date(epochMs)
  const end = new Date(epochMs + spanMs)
  let count = 0
  for (let i = 0; i < satrecs.length; i++) {
    const a = sampleAt(satrecs[i], start)
    if (!a) continue
    const b = sampleAt(satrecs[i], end)
    if (!b) continue
    packSwarmSample(packed, count, a, b, colors[i] ?? [1, 1, 1])
    indices[count] = i
    count += 1
  }
  return { count, indices, skipped: satrecs.length - count }
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
): (SwarmTrailPoint | null)[] {
  const points: (SwarmTrailPoint | null)[] = []
  /* A satellite whose mean motion is not a usable number has no period to
     sample over; it contributes an empty trail rather than an infinite loop. */
  const periodMs = ((2 * Math.PI) / satrec.no) * 60_000
  if (!Number.isFinite(periodMs) || periodMs <= 0) return points
  const spanMs = periodMs * revolutions * 2
  for (let i = 0; i < SWARM_TRAIL_POINTS; i++) {
    const offset = -spanMs / 2 + (spanMs * i) / (SWARM_TRAIL_POINTS - 1)
    points.push(sampleAt(satrec, new Date(atMs + offset)))
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
): { skipped: number } {
  let skipped = 0
  for (let i = 0; i < count; i++) {
    const points = trailOf(satrecs[startIndex + i], atMs, revolutions)
    if (points.length === 0 || points.every((point) => point === null)) skipped++
    packSwarmTrail(packed, i, points, colors[startIndex + i] ?? [1, 1, 1])
  }
  return { skipped }
}

export const SWARM_KEYFRAME_FLOATS_PER_SATELLITE = SWARM_FLOATS_PER_SATELLITE
export const SWARM_TRAIL_FLOATS = SWARM_TRAIL_FLOATS_PER_SATELLITE
