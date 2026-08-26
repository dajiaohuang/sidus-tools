import { describe, expect, it } from 'vitest'
import {
  altitudeMarginWorld,
  createSwarmPickIndex,
  nearestCandidateSegment,
  SWARM_PICK_GRID,
  SWARM_TRAIL_SEGMENTS,
  type SwarmProjector,
} from './swarm-pick'
import {
  packSwarmTrail,
  SWARM_TRAIL_FLOATS_PER_SATELLITE,
  SWARM_TRAIL_POINTS,
  type SwarmTrailPoint,
} from './swarm-trails'
import { isPointOccludedByGlobe, sphereDirection } from './sun'

const point = (x: number, y: number, elevationM = 550_000): SwarmTrailPoint => ({
  mercatorX: x,
  mercatorY: y,
  elevationM,
})

/** One satellite's trail packed into a batch-shaped buffer. */
function batchOf(points: SwarmTrailPoint[][]): Float32Array {
  const packed = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE * points.length)
  points.forEach((trail, i) => packSwarmTrail(packed, i, trail))
  return packed
}

/** A trail marching east along a constant parallel. */
function eastward(y: number, fromX = 0.1, step = 0.004): SwarmTrailPoint[] {
  return Array.from({ length: SWARM_TRAIL_POINTS }, (_, i) => point(fromX + i * step, y))
}

describe('swarm pick index', () => {
  it('finds the segment under a point and ignores the rest', () => {
    const index = createSwarmPickIndex()
    index.reset(2)
    index.addBatch(batchOf([eastward(0.5), eastward(0.2)]), 0, 2)

    // A point sitting on the first trail, a third of the way along.
    const onTrail = index.candidatesAt(0.1 + 30 * 0.004, 0.5)
    expect(onTrail.length).toBeGreaterThan(0)
    const satellites = new Set(onTrail.map((id) => index.satelliteOf(id)))
    expect(satellites.has(0)).toBe(true)

    // Far from either trail: nothing in the neighbourhood.
    expect(index.candidatesAt(0.8, 0.85)).toHaveLength(0)
  })

  it('returns endpoints that match what was packed', () => {
    const index = createSwarmPickIndex()
    index.reset(1)
    index.addBatch(batchOf([eastward(0.4)]), 0, 1)

    const first = index.endpointsOf(0)
    expect(first.ax).toBeCloseTo(0.1, 5)
    expect(first.bx).toBeCloseTo(0.104, 5)
    expect(first.ay).toBeCloseTo(0.4, 5)
    expect(first.aElevationM).toBeCloseTo(550_000, 0)
  })

  it('places a batch at its own offset in the population', () => {
    const index = createSwarmPickIndex()
    index.reset(4)
    index.addBatch(batchOf([eastward(0.5)]), 2, 1)

    expect(index.filled()).toBe(3)
    const found = index.candidatesAt(0.1 + 10 * 0.004, 0.5)
    expect(found.length).toBeGreaterThan(0)
    expect(new Set(found.map((id) => index.satelliteOf(id)))).toEqual(new Set([2]))
  })

  it('indexes a seam-crossing step in the two cells it really touches', () => {
    const index = createSwarmPickIndex()
    index.reset(1)
    /* Marching east over the 0/1 seam: without unwrapping, this one step would
       be spread across every cell of its row. */
    const trail = Array.from({ length: SWARM_TRAIL_POINTS }, (_, i) =>
      point((0.98 + i * 0.004) % 1, 0.5),
    )
    index.addBatch(batchOf([trail]), 0, 1)

    const occupancy = index.occupancy()
    // A trail of 95 short steps cannot honestly occupy a whole row of 64 cells.
    expect(occupancy.entries).toBeLessThan(SWARM_TRAIL_SEGMENTS * 3)
    // The seam itself is still findable from either side.
    expect(index.candidatesAt(0.999, 0.5).length).toBeGreaterThan(0)
    expect(index.candidatesAt(0.001, 0.5).length).toBeGreaterThan(0)
  })

  it('never indexes a degenerate pair, which is not drawn', () => {
    const index = createSwarmPickIndex()
    index.reset(1)
    const trail: (SwarmTrailPoint | null)[] = eastward(0.5)
    trail[40] = null
    const packed = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE)
    packSwarmTrail(packed, 0, trail)
    index.addBatch(packed, 0, 1)

    // Two segments collapse around the missing sample, so two fewer entries.
    const dense = createSwarmPickIndex()
    dense.reset(1)
    dense.addBatch(batchOf([eastward(0.5)]), 0, 1)
    expect(index.occupancy().entries).toBe(dense.occupancy().entries - 2)
  })

  it('keeps the altitude margin inside the one-cell ring the lookup uses', () => {
    const cell = 1 / SWARM_PICK_GRID
    // The shells this view draws top out near 600 km.
    expect(altitudeMarginWorld(600)).toBeLessThan(cell)
    expect(altitudeMarginWorld(600)).toBeCloseTo(0.015, 3)
  })

  it('does not grow when one satellite is re-produced without a full cycle', () => {
    const index = createSwarmPickIndex()
    index.reset(10_000)
    const packed = batchOf([eastward(0.4)])
    index.addBatch(packed, 42, 1)
    const once = index.occupancy().entries
    expect(once).toBeGreaterThan(0)
    for (let i = 0; i < 80; i++) index.addBatch(packed, 42, 1)
    expect(index.occupancy().entries).toBe(once)
  })

  it('bounds memory to at most two cycles of entries across many re-productions', () => {
    const index = createSwarmPickIndex()
    const populationSize = 8
    index.reset(populationSize)

    /* One full population delivered as several small batches, the way the
       real looping producer delivers a population larger than one batch. */
    const deliverCycle = (cycle: number) => {
      const trails = Array.from({ length: populationSize }, (_, i) =>
        eastward(0.1 + i * 0.1, 0.1 + cycle * 0.0003),
      )
      const chunk = 3
      for (let start = 0; start < populationSize; start += chunk) {
        const count = Math.min(chunk, populationSize - start)
        index.addBatch(batchOf(trails.slice(start, start + count)), start, count)
      }
    }

    deliverCycle(0)
    const afterFirstCycle = index.occupancy().entries

    for (let cycle = 1; cycle <= 10; cycle++) deliverCycle(cycle)
    const afterEleventhCycle = index.occupancy().entries

    expect(afterEleventhCycle).toBeLessThanOrEqual(afterFirstCycle * 2)
  })

  it('finds a drifting trail at its current cells after several full cycles', () => {
    const index = createSwarmPickIndex()
    index.reset(2)
    const other = eastward(0.7)
    /* A flat, order-preserving projector: enough for the exact stage to rank
       segments by screen distance without a real camera. */
    const flatProject: SwarmProjector = (mercatorX, mercatorY) => ({
      x: mercatorX * 10_000,
      y: mercatorY * 10_000,
    })

    let current = eastward(0.3)
    for (let cycle = 0; cycle < 8; cycle++) {
      // Each cycle drifts less than half a cell, the way a real ground track creeps.
      current = eastward(0.3, 0.1 + cycle * 0.003)
      index.addBatch(batchOf([current, other]), 0, 2)
    }

    const p = current[0]
    const candidates = index.candidatesAt(p.mercatorX, p.mercatorY)
    const screen = flatProject(p.mercatorX, p.mercatorY, p.elevationM)!
    const found = nearestCandidateSegment(index, candidates, screen.x, screen.y, flatProject)
    expect(found?.satellite).toBe(0)
  })
})

describe('isPointOccludedByGlobe', () => {
  /** Camera three radii out, looking down the +z axis of the globe frame. */
  const cameraDistance = 3
  const axis = sphereDirection(0, 0)
  const plane: [number, number, number, number] = [
    axis[0],
    axis[1],
    axis[2],
    -1 / cameraDistance,
  ]

  it('shows the point under the camera and hides its antipode', () => {
    expect(isPointOccludedByGlobe(axis, plane)).toBe(false)
    expect(isPointOccludedByGlobe([-axis[0], -axis[1], -axis[2]], plane)).toBe(true)
  })

  it('lets altitude see over the horizon that hides the ground below it', () => {
    /* A point just past the horizon: on the surface it is hidden, and lifting
       it to a Starlink shell brings it back into view. */
    const horizonLat = Math.acos(1 / cameraDistance) * (180 / Math.PI)
    const justPast = sphereDirection(horizonLat + 1, 0)
    expect(isPointOccludedByGlobe(justPast, plane)).toBe(true)

    const lifted = 1 + 550 / 6371
    expect(
      isPointOccludedByGlobe(
        [justPast[0] * lifted, justPast[1] * lifted, justPast[2] * lifted],
        plane,
      ),
    ).toBe(false)
  })
})
