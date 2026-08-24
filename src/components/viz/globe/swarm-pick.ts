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
  let buckets: (Int32Array | null)[] = []
  let bucketLengths = new Int32Array(0)
  let trails = new Float32Array(0)
  /**
   * First drawable vertex of each satellite as last INDEXED, or NaN.
   *
   * The looping producer re-delivers every trail about once a minute, and a
   * ground track moves a fraction of a degree in that time. Re-pushing ninety
   * five segment ids per satellite per cycle would grow the buckets without
   * bound for a session left open; comparing against this anchor skips the
   * pushes while the trail has not moved by a meaningful fraction of a cell.
   * The DATA is still copied in either way, so the exact stage always tests
   * current geometry: a stale bucket entry can only cost a projection, never
   * a wrong answer.
   */
  let anchors = new Float32Array(0)
  let satelliteCount = 0
  let filledCount = 0

  const push = (cell: number, id: number) => {
    let bucket = buckets[cell]
    const used = bucketLengths[cell]
    if (!bucket) {
      bucket = new Int32Array(BUCKET_SEED)
      buckets[cell] = bucket
    } else if (used === bucket.length) {
      const grown = new Int32Array(bucket.length * 2)
      grown.set(bucket)
      bucket = grown
      buckets[cell] = grown
    }
    bucket[used] = id
    bucketLengths[cell] = used + 1
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
      anchors = new Float32Array(nextCount * 2).fill(Number.NaN)
      buckets = new Array(cellCount).fill(null)
      bucketLengths = new Int32Array(cellCount)
    },

    addBatch(packed, startIndex, count) {
      if (count <= 0 || startIndex + count > satelliteCount) return
      trails.set(packed.subarray(0, count * SWARM_TRAIL_FLOATS_PER_SATELLITE), startIndex * SWARM_TRAIL_FLOATS_PER_SATELLITE)

      const stride = SWARM_TRAIL_FLOATS_PER_VERTEX
      /* Half a cell of movement is where a stale bucket could start LYING by
         omission; below that, skipping the re-index only leaves harmless
         extra candidates. */
      const reindexThreshold = 0.5 / SWARM_PICK_GRID
      for (let s = 0; s < count; s++) {
        const satellite = startIndex + s
        const base = satellite * SWARM_TRAIL_FLOATS_PER_SATELLITE
        const anchorX = trails[base]
        const anchorY = trails[base + 1]
        const last = anchors[satellite * 2]
        let movedX = Math.abs(anchorX - (Number.isNaN(last) ? Infinity : last))
        if (movedX > 0.5) movedX = 1 - movedX
        const moved =
          Number.isNaN(last) ||
          movedX > reindexThreshold ||
          Math.abs(anchorY - anchors[satellite * 2 + 1]) > reindexThreshold
        if (!moved) continue
        anchors[satellite * 2] = anchorX
        anchors[satellite * 2 + 1] = anchorY
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
              push(cy * SWARM_PICK_GRID + wrappedX, id)
            }
          }
        }
      }
      if (startIndex + count > filledCount) filledCount = startIndex + count
    },

    candidatesAt(x, y, neighbourhood = 1) {
      if (buckets.length === 0) return []
      const centreX = cellX(x)
      const centreY = cellY(y)
      const seen = new Set<number>()
      for (let dx = -neighbourhood; dx <= neighbourhood; dx++) {
        const cx = ((centreX + dx) % SWARM_PICK_GRID + SWARM_PICK_GRID) % SWARM_PICK_GRID
        for (let dy = -neighbourhood; dy <= neighbourhood; dy++) {
          const cy = centreY + dy
          if (cy < 0 || cy >= SWARM_PICK_GRID) continue
          const cell = cy * SWARM_PICK_GRID + cx
          const bucket = buckets[cell]
          if (!bucket) continue
          const used = bucketLengths[cell]
          for (let i = 0; i < used; i++) seen.add(bucket[i])
        }
      }
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
      for (let cell = 0; cell < bucketLengths.length; cell++) {
        const used = bucketLengths[cell]
        entries += used
        if (used > max) max = used
      }
      const cells = bucketLengths.length
      return { cells, entries, mean: entries / (cells || 1), max }
    },
  }
}
