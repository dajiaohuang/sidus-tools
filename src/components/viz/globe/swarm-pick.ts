/**
 * Spatial index over the swarm's trail segments, so the pointer can find the
 * one it is on without touching the other million.
 *
 * ## Why a segment grid rather than a box per satellite
 *
 * The obvious prune, one bounding box per satellite, does not prune at all
 * here: a trail is a full revolution, a full revolution is a closed ring, and
 * a closed ring crosses every meridian. Measured over the real catalogue, a
 * per-satellite box is 98% of the world wide and covers a third of its area,
 * so a box test leaves about 3,700 of 10,700 candidates. The locality that
 * does exist is per SEGMENT, and that is what this indexes.
 *
 * ## What it is and is not
 *
 * This is a PRUNE, never a verdict. It works in the stored Earth-fixed
 * mercator frame, which is flat and cheap, and hands back a short candidate
 * list. The
 * caller then projects those few segments through the real chain, elevation
 * and limb occlusion included, and decides in screen space. Nothing here is
 * allowed to reject something the exact test would have accepted.
 *
 * ## The neighbourhood, and why one ring of cells is enough
 *
 * A lookup unprojects the pointer to the GROUND, while the trail is drawn at
 * altitude. At the limb, where the offset is entirely across the view, a
 * satellite at height h appears displaced from its ground position by h, which
 * in world units is h / (2 * pi * R): 0.0150 at 600 km, against a cell of
 * 1/64 = 0.0156. So the true segment is at most one cell away from the cell
 * the ground point lands in, and a one-cell ring covers it. The margin is thin
 * by design rather than by luck, which is why `neighbourhood` is a parameter
 * and why the pick accuracy is measured at high pitch instead of assumed.
 */

import { SWARM_TRAIL_FLOATS_PER_SATELLITE, SWARM_TRAIL_FLOATS_PER_VERTEX, SWARM_TRAIL_POINTS } from './swarm-trails'

/** Cells per axis over the unit mercator square. */
export const SWARM_PICK_GRID = 64

/** Pointer slack for catching a trail or a dot, in CSS pixels. */
export const SWARM_PICK_RADIUS_PX = 6

/** Drawn segments per satellite. */
export const SWARM_TRAIL_SEGMENTS = SWARM_TRAIL_POINTS - 1

/** Earth's mean radius in kilometres, for the altitude margin above. */
const EARTH_RADIUS_KM = 6371

/** Worst ground displacement a drawn altitude can add, in world units. */
export function altitudeMarginWorld(altitudeKm: number): number {
  return altitudeKm / (2 * Math.PI * EARTH_RADIUS_KM)
}

/** Geographic position of a stored mercator vertex. */
export function lonLatOfMercator(
  mercatorX: number,
  mercatorY: number,
): { lonDeg: number; latDeg: number } {
  return {
    lonDeg: (mercatorX - Math.floor(mercatorX)) * 360 - 180,
    latDeg: (Math.asin(Math.tanh(2 * Math.PI * (0.5 - mercatorY))) * 180) / Math.PI,
  }
}

/** Where a stored vertex lands on screen, or null when it is not drawn. */
export type SwarmProjector = (
  mercatorX: number,
  mercatorY: number,
  elevationM: number,
) => { x: number; y: number } | null

/**
 * The exact stage: the nearest candidate segment to a pixel, in screen space.
 *
 * Separate from the grid on purpose. The grid is an approximation that only has
 * to be generous; THIS decides, and it decides through the caller's real
 * projection, so elevation and the globe's limb are honoured rather than
 * modelled. Keeping it a pure function of a projector is also what lets it be
 * tested against a synthetic camera instead of a browser. Store and screen
 * share the Earth-fixed frame, so the endpoints project as stored.
 */
export function nearestCandidateSegment(
  index: SwarmPickIndex,
  candidates: readonly number[],
  x: number,
  y: number,
  project: SwarmProjector,
  radiusPx: number = SWARM_PICK_RADIUS_PX,
): { satellite: number; distancePx: number; projections: number } | null {
  let best: { satellite: number; distancePx: number } | null = null
  let projections = 0
  for (const id of candidates) {
    const e = index.endpointsOf(id)
    const a = project(e.ax, e.ay, e.aElevationM)
    const b = project(e.bx, e.by, e.bElevationM)
    projections += 2
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared))
        : 0
    const distancePx = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
    if (distancePx > radiusPx) continue
    if (!best || distancePx < best.distancePx) {
      best = { satellite: index.satelliteOf(id), distancePx }
    }
  }
  return best ? { ...best, projections } : null
}

export type SwarmSegmentEndpoints = {
  ax: number
  ay: number
  aElevationM: number
  bx: number
  by: number
  bElevationM: number
}

export type SwarmPickIndex = {
  /** Sizes the store for the whole population and empties the grid. */
  reset(satelliteCount: number): void
  /** Copies one batch of packed trails in and indexes its segments. */
  addBatch(packed: Float32Array, startIndex: number, count: number): void
  /** Encoded segment ids near a point in stored mercator space. */
  candidatesAt(x: number, y: number, neighbourhood?: number): number[]
  satelliteOf(id: number): number
  endpointsOf(id: number): SwarmSegmentEndpoints
  /** Satellites whose trails have been indexed so far. */
  filled(): number
  occupancy(): { cells: number; entries: number; mean: number; max: number }
}

/** First capacity of a cell's bucket, doubled from there as it fills. */
const BUCKET_SEED = 32

export function createSwarmPickIndex(): SwarmPickIndex {
  const cellCount = SWARM_PICK_GRID * SWARM_PICK_GRID

  /*
   * Buckets are typed arrays rather than plain ones. The population puts a few
   * million segment references in here, and at that size `number[]` costs both
   * the boxed slots and the churn of growing thousands of them, which was
   * enough to take the renderer down mid-convergence. Int32Array holds the same
   * references in four bytes each with no per-element overhead.
   */
  type Generation = { buckets: (Int32Array | null)[]; bucketLengths: Int32Array }
  const emptyGeneration = (size: number): Generation => ({
    buckets: new Array(size).fill(null),
    bucketLengths: new Int32Array(size),
  })

  /**
   * Two generations of the grid: `front` answers every query, `back` is what
   * the arriving cycle is building.
   *
   * `addBatch` indexes ALL of a batch's non-degenerate segments into `back`,
   * unconditionally. The trail has to be findable at its CURRENT cells: the
   * module header already spends most of the one-cell margin on altitude
   * displacement at the limb, so skipping a re-index would let position drift
   * stack onto that margin until the true segment left the ±1-cell ring
   * `candidatesAt` searches, and hover would go dead until the next full
   * re-index reached it. Reading BOTH generations in `candidatesAt` is what
   * makes always-reindexing safe for hover: a satellite `back` has already
   * reached this cycle is found there at its fresh cells, while everything
   * `back` has not reached yet is still answered by `front`'s complete pass
   * from the cycle before.
   *
   * `backSeen`/`backCovered` track how much of the population `back` has
   * reached. Once every satellite has been indexed into it at least once,
   * `back` becomes `front` and a freshly emptied grid takes over as `back`.
   * That swap is what bounds memory instead of a skip: an old cycle's ids are
   * dropped wholesale at the swap rather than accumulating, so residency is at
   * most two cycles, one complete and one in progress, however long the
   * session runs.
   */
  let front: Generation = emptyGeneration(0)
  let back: Generation = emptyGeneration(0)
  let backSeen = new Uint8Array(0)
  let backCovered = 0

  let trails = new Float32Array(0)
  let satelliteCount = 0
  let filledCount = 0

  const push = (generation: Generation, cell: number, id: number) => {
    let bucket = generation.buckets[cell]
    const used = generation.bucketLengths[cell]
    if (!bucket) {
      bucket = new Int32Array(BUCKET_SEED)
      generation.buckets[cell] = bucket
    } else if (used === bucket.length) {
      const grown = new Int32Array(bucket.length * 2)
      grown.set(bucket)
      bucket = grown
      generation.buckets[cell] = grown
    }
    bucket[used] = id
    generation.bucketLengths[cell] = used + 1
  }

  const cellX = (x: number) => {
    const wrapped = x - Math.floor(x)
    return Math.min(SWARM_PICK_GRID - 1, Math.floor(wrapped * SWARM_PICK_GRID))
  }
  const cellY = (y: number) =>
    Math.max(0, Math.min(SWARM_PICK_GRID - 1, Math.floor(y * SWARM_PICK_GRID)))

  return {
    reset(nextCount) {
      satelliteCount = nextCount
      filledCount = 0
      trails = new Float32Array(nextCount * SWARM_TRAIL_FLOATS_PER_SATELLITE)
      front = emptyGeneration(cellCount)
      back = emptyGeneration(cellCount)
      backSeen = new Uint8Array(nextCount)
      backCovered = 0
    },

    addBatch(packed, startIndex, count) {
      if (count <= 0 || startIndex + count > satelliteCount) return
      trails.set(packed.subarray(0, count * SWARM_TRAIL_FLOATS_PER_SATELLITE), startIndex * SWARM_TRAIL_FLOATS_PER_SATELLITE)

      const stride = SWARM_TRAIL_FLOATS_PER_VERTEX
      for (let s = 0; s < count; s++) {
        const satellite = startIndex + s
        /* Geometry is already in `trails`. Skip a satellite already indexed
           this generation so only-selected refresh cannot grow the grid. */
        if (backSeen[satellite] !== 0) continue
        const base = satellite * SWARM_TRAIL_FLOATS_PER_SATELLITE
        for (let segment = 0; segment < SWARM_TRAIL_SEGMENTS; segment++) {
          const at = base + segment * stride * 2
          const ax = trails[at]
          const ay = trails[at + 1]
          const bxRaw = trails[at + stride]
          const by = trails[at + stride + 1]
          // A degenerate pair is not drawn, so it must not be pickable either.
          if (ax === bxRaw && ay === by) continue

          /* Unwrap the far end next to the near one, so a seam-crossing step
             spans the two cells it really touches instead of the whole row. */
          let bx = bxRaw
          if (bx - ax > 0.5) bx -= 1
          else if (ax - bx > 0.5) bx += 1

          const id = satellite * SWARM_TRAIL_SEGMENTS + segment
          const fromX = Math.floor(Math.min(ax, bx) * SWARM_PICK_GRID)
          const toX = Math.floor(Math.max(ax, bx) * SWARM_PICK_GRID)
          const fromY = cellY(Math.min(ay, by))
          const toY = cellY(Math.max(ay, by))
          for (let cx = fromX; cx <= toX; cx++) {
            const wrappedX = ((cx % SWARM_PICK_GRID) + SWARM_PICK_GRID) % SWARM_PICK_GRID
            for (let cy = fromY; cy <= toY; cy++) {
              push(back, cy * SWARM_PICK_GRID + wrappedX, id)
            }
          }
        }
        backSeen[satellite] = 1
        backCovered++
      }
      if (startIndex + count > filledCount) filledCount = startIndex + count
      if (backCovered === satelliteCount) {
        front = back
        back = emptyGeneration(cellCount)
        backSeen.fill(0)
        backCovered = 0
      }
    },

    candidatesAt(x, y, neighbourhood = 1) {
      if (front.buckets.length === 0) return []
      const centreX = cellX(x)
      const centreY = cellY(y)
      const seen = new Set<number>()
      const collect = (generation: Generation) => {
        for (let dx = -neighbourhood; dx <= neighbourhood; dx++) {
          const cx = ((centreX + dx) % SWARM_PICK_GRID + SWARM_PICK_GRID) % SWARM_PICK_GRID
          for (let dy = -neighbourhood; dy <= neighbourhood; dy++) {
            const cy = centreY + dy
            if (cy < 0 || cy >= SWARM_PICK_GRID) continue
            const cell = cy * SWARM_PICK_GRID + cx
            const bucket = generation.buckets[cell]
            if (!bucket) continue
            const used = generation.bucketLengths[cell]
            for (let i = 0; i < used; i++) seen.add(bucket[i])
          }
        }
      }
      collect(front)
      collect(back)
      return [...seen]
    },

    satelliteOf(id) {
      return Math.floor(id / SWARM_TRAIL_SEGMENTS)
    },

    endpointsOf(id) {
      const satellite = Math.floor(id / SWARM_TRAIL_SEGMENTS)
      const segment = id % SWARM_TRAIL_SEGMENTS
      const stride = SWARM_TRAIL_FLOATS_PER_VERTEX
      const at = satellite * SWARM_TRAIL_FLOATS_PER_SATELLITE + segment * stride * 2
      return {
        ax: trails[at],
        ay: trails[at + 1],
        aElevationM: trails[at + 2],
        bx: trails[at + stride],
        by: trails[at + stride + 1],
        bElevationM: trails[at + stride + 2],
      }
    },

    filled() {
      return filledCount
    },

    occupancy() {
      let entries = 0
      let max = 0
      for (const generation of [front, back]) {
        for (let cell = 0; cell < generation.bucketLengths.length; cell++) {
          const used = generation.bucketLengths[cell]
          entries += used
          if (used > max) max = used
        }
      }
      const cells = front.bucketLengths.length
      return { cells, entries, mean: entries / (cells || 1), max }
    },
  }
}
