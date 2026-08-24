/**
 * Wire format for the swarm's trajectories, and the packing that turns a
 * satellite's sampled revolution into drawable line segments.
 *
 * ## The samples are EARTH-FIXED ground tracks, kept fresh by REPRODUCTION
 *
 * A trajectory drawn over ground has to stand still on the ground. An
 * inertial store spun by the sidereal angle at draw time would keep a
 * once-produced trail under its dot forever, but at the price of the
 * picture: the whole sky of lines would sweep westward at 15 degrees an hour
 * over a map that does not move, and hovering a swept line would identify a
 * satellite whose fresh track appears somewhere else.
 *
 * Earth-fixed storage is only honest while the trail is CURRENT: a ground
 * track ages as the satellite flies on, about 24 degrees of longitude per
 * revolution. What makes it affordable is that production is lazy and
 * batched: the same cursor that converges the population once simply keeps
 * looping, so every trail is re-produced from the live clock about once a
 * minute, which is one four-hundredth of the staleness a produced-once cache
 * would accumulate per orbit. The dots therefore sit on their trails, and the
 * trails sit on the ground.
 *
 * ## Why segments rather than a strip
 *
 * Every trail in the population is drawn by ONE `gl.drawArrays`, so the whole
 * buffer is a single primitive stream. A LINE_STRIP cannot express a break: the
 * segment joining the last point of one trail to the first point of the next
 * would be drawn straight across the world, and no vertex placement removes it
 * cleanly, because a segment with one endpoint outside the clip volume is
 * clipped to a partial line rather than discarded. Independent `gl.LINES` pairs
 * have no such joining segment at all, and a break WITHIN a trail is expressed
 * by collapsing that one pair onto a single point: a zero-length line is not
 * rasterised, so it costs two vertices and draws nothing.
 *
 * That is what the antimeridian needs. Mercator x wraps at 0 and 1, so a
 * satellite stepping across it would otherwise draw a line back across every
 * meridian it did not cross.
 *
 * ## Cost
 *
 * The whole population costs `count * SWARM_TRAIL_FLOATS_PER_SATELLITE * 4`
 * bytes, about 31 MB at ten thousand satellites, re-uploaded one batch per
 * keyframe cycle rather than per frame. The sample count that fixes it is
 * argued at SWARM_TRAIL_POINTS below.
 */

/**
 * Samples per trail: one full revolution.
 *
 * Set by what the drawn chord costs against the true arc. Measured worst-case
 * sagitta over the shells, converted through the globe's scale at view centre:
 *
 *   64 samples -> 8.64 km, 0.88 px at a continental view, 3.53 px close in
 *   96 samples -> 3.80 km, 0.39 px                        1.55 px
 *  128 samples -> 2.13 km, 0.22 px                        0.87 px
 *
 * 96 is the count that brings the close-up inside two pixels, for about 31 MB
 * across ten thousand satellites. It does NOT clear two pixels at extreme zoom,
 * where the residual is 6.2 px; that case is served by the full-treatment path
 * instead, which gives a hovered, pinned or individually added satellite its
 * own precisely refined trail. Buying extreme zoom for the whole population
 * would cost 192 samples and about 62 MB to serve a view nobody reaches with
 * the swarm still on.
 */
export const SWARM_TRAIL_POINTS = 96

/** Line-segment endpoints per trail, two per segment between consecutive samples. */
export const SWARM_TRAIL_VERTICES_PER_SATELLITE = (SWARM_TRAIL_POINTS - 1) * 2

/**
 * Mercator x, mercator y, elevation in metres, the OTHER endpoint's x, then rgb.
 *
 * The partner's x is what keeps the antimeridian safe. Each vertex is shaded
 * independently, so a segment straddling the 0/1 seam would put its two ends
 * on opposite sides of the world and be drawn straight across every meridian
 * between them. Knowing where the partner sits lets each end agree on which
 * side to land.
 *
 * The colour rides along for the same reason it rides with the dots: a trail is
 * that satellite's trail, in that satellite's colour, at every population size.
 */
export const SWARM_TRAIL_FLOATS_PER_VERTEX = 7

export const SWARM_TRAIL_FLOATS_PER_SATELLITE =
  SWARM_TRAIL_VERTICES_PER_SATELLITE * SWARM_TRAIL_FLOATS_PER_VERTEX

/**
 * Satellites whose trails are produced per keyframe cycle.
 *
 * The population converges progressively rather than stalling the worker on one
 * enormous batch: at this size ten thousand satellites are complete in about
 * thirty cycles, which is a minute at the two-second keyframe cadence, and each
 * batch costs the worker roughly as much as the keyframe it rides with.
 */
export const SWARM_TRAIL_BATCH = 360

/** One sampled point of a trail, in the same units as the keyframe packing. */
export type SwarmTrailPoint = {
  mercatorX: number
  mercatorY: number
  elevationM: number
}

/**
 * Expands one satellite's sampled revolution into line-segment endpoints at
 * `index` in the shared buffer.
 *
 * A sample the propagator could not produce is null and collapses its segment
 * to a degenerate pair, which breaks the trail there and draws nothing.
 */
export function packSwarmTrail(
  target: Float32Array,
  index: number,
  points: readonly (SwarmTrailPoint | null)[],
  rgb: readonly [number, number, number] = [1, 1, 1],
): void {
  const stride = SWARM_TRAIL_FLOATS_PER_VERTEX
  let at = index * SWARM_TRAIL_FLOATS_PER_SATELLITE
  for (let i = 0; i < SWARM_TRAIL_POINTS - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    /* Only a MISSING sample breaks the trail. The antimeridian does not: the
       shader puts both ends of a segment in the same copy of the world from
       the partner x below, so a step across the seam is drawn the short way
       round rather than back across every meridian. */
    const from = a ?? { mercatorX: 0, mercatorY: 0, elevationM: 0 }
    const to = a && b ? b : from
    target[at] = from.mercatorX
    target[at + 1] = from.mercatorY
    target[at + 2] = from.elevationM
    target[at + 3] = to.mercatorX
    target[at + 4] = rgb[0]
    target[at + 5] = rgb[1]
    target[at + 6] = rgb[2]
    target[at + stride] = to.mercatorX
    target[at + stride + 1] = to.mercatorY
    target[at + stride + 2] = to.elevationM
    target[at + stride + 3] = from.mercatorX
    target[at + stride + 4] = rgb[0]
    target[at + stride + 5] = rgb[1]
    target[at + stride + 6] = rgb[2]
    at += stride * 2
  }
}

/** Messages the main thread sends the worker about trails. */
export type SwarmTrailRequest = {
  type: 'trails'
  /** First satellite of the batch, in the worker's own load order. */
  startIndex: number
  count: number
  /** Instant the revolution starts at. */
  atMs: number
  /**
   * True when this re-produces a trail that has already been drawn once.
   *
   * A cache built at one instant does not stay true: the orbit PRECESSES under
   * it. Measured on a Starlink element set against its own drawn line: 0.6 km
   * after half an hour, 15 km after one, 87 km after six, 222 km after twelve.
   * At crowd zooms that is sub-pixel and the cache is the right trade; on the
   * one satellite being attended to it is the whole complaint, and re-doing a
   * single trail costs 0.3 ms. So that one is kept fresh and the flag says
   * which kind of batch came back, because the two are handled differently at
   * the far end: a refresh must not advance the loading progress, and must not
   * be indexed for picking a second time.
   */
  refresh?: boolean
}

export type SwarmTrailResponse = {
  type: 'trailBatch'
  startIndex: number
  /** Satellites actually packed, which may be fewer than asked at the tail. */
  count: number
  /** Satellites in the batch that produced no usable sample at all. */
  skipped: number
  packed: Float32Array
  /** Echoed from the request: this batch re-produces already-drawn slots. */
  refresh?: boolean
  /** Set only when the batch could not be produced at all. */
  error?: string
}
