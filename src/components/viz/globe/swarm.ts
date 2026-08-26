/**
 * Wire format between the SGP4 worker and the swarm layer, and the packing
 * that lets the GPU do the interpolating.
 *
 * ## Why keyframes at all
 *
 * SGP4 for eight thousand satellites is far too much to run every frame, but
 * the positions it produces are smooth: over a second or two a satellite moves
 * along an almost straight line. So the worker evaluates the real propagator on
 * a slow cadence and the GPU carries every frame in between, which turns a
 * per-frame CPU cost into a per-keyframe one.
 *
 * A pair of keyframes is packed as a START and a DELTA rather than two
 * positions, for two reasons: the shader then costs one multiply-add, and the
 * antimeridian is handled once here instead of every frame. Mercator x wraps at
 * 0 and 1, so a satellite crossing it would otherwise be interpolated the long
 * way round the world; the delta is wrapped into [-0.5, 0.5] so it always takes
 * the short way, and the shader wraps the result back into range.
 *
 * ## Precision
 *
 * Positions travel as float32 in mercator units, where the whole world is 1.
 * A float32 holds about seven decimal digits, so the quantum is around four
 * metres at the equator: far below a pixel at any zoom this view reaches, and
 * the same precision the altitude layer already draws its trails with.
 *
 * Linear interpolation over a five-second keyframe covers about 38 km of a
 * roughly 6800 km orbit, whose sagitta is 38^2 / (8 * 6800), about 27 m. Also
 * far below a pixel.
 */

import type { SwarmTrailRequest, SwarmTrailResponse } from './swarm-trails'

/**
 * Floats per satellite in the packed buffer: start xyz, delta xyz, then rgb.
 *
 * The colour travels WITH the position because a satellite's colour is its
 * identity in this view, the same swatch the list shows beside its name, and
 * every satellite has one whether there is one of them or ten thousand. A
 * uniform could only paint the whole population at once and would flatten a
 * group into an undifferentiated cloud.
 */
export const SWARM_FLOATS_PER_SATELLITE = 9

/** Keyframe spacing. Long enough to be cheap, short enough that a chord is straight. */
export const SWARM_KEYFRAME_MS = 2000

/**
 * What the worker is told to propagate.
 *
 * `rgb` is the satellite's own colour, normalised, carried from the list's
 * swatch. Every satellite has one; there is no path where a satellite is drawn
 * in a population colour instead of its own.
 */
export type SwarmTle = {
  catnr: string
  line1: string
  line2: string
  rgb: [number, number, number]
}

/** Messages the main thread sends the worker. */
export type SwarmRequest =
  | { type: 'load'; tles: SwarmTle[]; trailRevolutions: number }
  | {
      type: 'produce'
      epochMs: number
      spanMs: number
      inertial?: boolean
      /**
       * Greenwich freeze for inertial conversion. The orbital view latches one
       * value for dots, trails and the identified full-treatment track; omit
       * it and the worker latches the first epoch of the load.
       */
      freezeMs?: number
      /** Satrec index the full-treatment path already draws; packed as an empty slot. */
      skipIndex?: number
    }
  | SwarmTrailRequest
  | { type: 'stop' }

/** Messages the worker sends back. */
export type SwarmResponse =
  | {
      type: 'keyframe'
      /** Instant the START positions are valid at. */
      epochMs: number
      /** Instant the start-plus-delta positions are valid at. */
      spanMs: number
      /** Packed slots, one per loaded satrec. Empty slots are NaN, not omitted. */
      count: number
      /** Satellites that could not be propagated at both instants this time. */
      skipped: number
      /** SWARM_FLOATS_PER_SATELLITE per satellite, transferred rather than copied. */
      packed: Float32Array
      /** Packed slot to satrec index. Slot k is satrec k; empty slots stay empty. */
      indices: Uint32Array
      /** Set only when the batch could not be produced at all. */
      error?: string
    }
  | {
      type: 'loaded'
      count: number
      /** Catalogue numbers of the accepted sets, IN SATREC ORDER. */
      accepted: string[]
      rejected: string[]
      error?: string
    }
  | SwarmTrailResponse

/**
 * Shortest signed distance between two mercator longitudes, in world units.
 * The world is 1 wide and wraps, so a step of 0.9 east is really 0.1 west.
 */
export function wrapMercatorDelta(delta: number): number {
  let wrapped = delta % 1
  if (wrapped > 0.5) wrapped -= 1
  if (wrapped < -0.5) wrapped += 1
  return wrapped
}

/**
 * Packs one satellite into the buffer at `index`, from its positions at the two
 * keyframe instants. Mirrors the shader exactly: what goes in here is what the
 * GPU reads out.
 */
export function packSwarmSample(
  target: Float32Array,
  index: number,
  start: { mercatorX: number; mercatorY: number; elevationM: number },
  end: { mercatorX: number; mercatorY: number; elevationM: number },
  rgb: readonly [number, number, number],
): void {
  const at = index * SWARM_FLOATS_PER_SATELLITE
  target[at] = start.mercatorX
  target[at + 1] = start.mercatorY
  target[at + 2] = start.elevationM
  target[at + 3] = wrapMercatorDelta(end.mercatorX - start.mercatorX)
  target[at + 4] = end.mercatorY - start.mercatorY
  target[at + 5] = end.elevationM - start.elevationM
  target[at + 6] = rgb[0]
  target[at + 7] = rgb[1]
  target[at + 8] = rgb[2]
}

/** Empty slot: NaN position so the GPU discards it and neighbours keep their index. */
export function packEmptySwarmSample(target: Float32Array, index: number): void {
  const at = index * SWARM_FLOATS_PER_SATELLITE
  target[at] = Number.NaN
  target[at + 1] = Number.NaN
  target[at + 2] = Number.NaN
  target[at + 3] = 0
  target[at + 4] = 0
  target[at + 5] = 0
  target[at + 6] = 0
  target[at + 7] = 0
  target[at + 8] = 0
}

/**
 * Where between the two keyframes the given instant falls, clamped.
 *
 * Clamping rather than extrapolating is deliberate: if a keyframe is late (a
 * busy main thread, a tab just made visible again) the swarm freezes on the
 * last known positions for a moment instead of flying off along a stale
 * velocity.
 */
export function keyframeProgress(nowMs: number, epochMs: number, spanMs: number): number {
  if (!(spanMs > 0)) return 0
  return Math.max(0, Math.min(1, (nowMs - epochMs) / spanMs))
}
