/**
 * End-to-end swarm picking against a SYNTHETIC camera.
 *
 * The pick is a composition: stored Earth-fixed mercator, the real projection
 * with elevation, the globe's limb, and a nearest test in pixels. Each part is checked elsewhere; this checks that the
 * composition names the right satellite, by building a camera whose geometry is
 * known in closed form and asking the pick about pixels whose correct answer is
 * therefore also known.
 */

import { describe, expect, it } from 'vitest'
import type { ProjectionData } from 'maplibre-gl'
import {
  createSwarmPickIndex,
  lonLatOfMercator,
  nearestCandidateSegment,
  type SwarmProjector,
} from './swarm-pick'
import { packSwarmTrail, SWARM_TRAIL_FLOATS_PER_SATELLITE, SWARM_TRAIL_POINTS, type SwarmTrailPoint } from './swarm-trails'
import { projectElevatedToScreen } from './projection'
import { isPointOccludedByGlobe, sphereDirection } from './sun'
import { GLOBE_RADIUS_M } from './track'

const RAD = Math.PI / 180
const WIDTH = 1200
const HEIGHT = 800
/** Camera distance from the globe's centre, in globe radii. */
const CAMERA_D = 3

/**
 * A perspective camera on +Z looking at the origin, in the same globe frame
 * projection.ts builds its sphere positions in. Column-major, as
 * transformMat4Vec4 reads it.
 */
function syntheticProjection(): ProjectionData {
  const fovRad = 45 * RAD
  const f = 1 / Math.tan(fovRad / 2)
  const aspect = WIDTH / HEIGHT
  const near = 0.1
  const far = 100
  const p10 = (far + near) / (near - far)
  const p14 = (2 * far * near) / (near - far)

  // Perspective composed with a translation of -D along z.
  const mainMatrix = new Float64Array(16)
  mainMatrix[0] = f / aspect
  mainMatrix[5] = f
  mainMatrix[10] = p10
  mainMatrix[11] = -1
  mainMatrix[14] = -CAMERA_D * p10 + p14
  mainMatrix[15] = CAMERA_D

  return {
    mainMatrix,
    fallbackMatrix: mainMatrix,
    tileMercatorCoords: [0, 0, 1, 1],
    // Normal toward the camera, with -w/|xyz| = 1/D as the horizon threshold.
    clippingPlane: [0, 0, 1, -1 / CAMERA_D],
    projectionTransition: 1,
  } as unknown as ProjectionData
}

const projection = syntheticProjection()

/** The projector the pick uses, limb included, against the synthetic camera. */
const project: SwarmProjector = (mercatorX, mercatorY, elevationM) => {
  const { lonDeg, latDeg } = lonLatOfMercator(mercatorX, mercatorY)
  const unit = sphereDirection(lonDeg, latDeg)
  const scale = 1 + elevationM / GLOBE_RADIUS_M
  if (
    isPointOccludedByGlobe(
      [unit[0] * scale, unit[1] * scale, unit[2] * scale],
      projection.clippingPlane as [number, number, number, number],
    )
  ) {
    return null
  }
  return projectElevatedToScreen(lonDeg, latDeg, elevationM, projection, WIDTH, HEIGHT, 'globe')
}

const toMercator = (lonDeg: number, latDeg: number) => ({
  mercatorX: lonDeg / 360 + 0.5,
  mercatorY: 0.5 - Math.log((1 + Math.sin(latDeg * RAD)) / (1 - Math.sin(latDeg * RAD))) / (4 * Math.PI),
})

/** A trail along a great circle of the given inclination, sampled as the worker does. */
function inclinedTrail(inclinationDeg: number, nodeLonDeg: number, altitudeM = 550_000) {
  const points: SwarmTrailPoint[] = []
  for (let i = 0; i < SWARM_TRAIL_POINTS; i++) {
    const u = (2 * Math.PI * i) / (SWARM_TRAIL_POINTS - 1)
    const latDeg = Math.asin(Math.sin(inclinationDeg * RAD) * Math.sin(u)) / RAD
    const lonDeg =
      ((Math.atan2(Math.cos(inclinationDeg * RAD) * Math.sin(u), Math.cos(u)) / RAD +
        nodeLonDeg +
        540) %
        360) -
      180
    points.push({ ...toMercator(lonDeg, latDeg), elevationM: altitudeM })
  }
  return points
}

function indexOf(trails: SwarmTrailPoint[][]) {
  const index = createSwarmPickIndex()
  index.reset(trails.length)
  const packed = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE * trails.length)
  trails.forEach((trail, i) => packSwarmTrail(packed, i, trail))
  index.addBatch(packed, 0, trails.length)
  return index
}

describe('swarm pick against a synthetic camera', () => {
  it('puts the sub-camera point at the centre of the frame', () => {
    const screen = project(0.5, 0.5, 0)
    expect(screen).not.toBeNull()
    expect(screen!.x).toBeCloseTo(WIDTH / 2, 6)
    expect(screen!.y).toBeCloseTo(HEIGHT / 2, 6)
  })

  it('names the satellite whose trail the pixel is on', () => {
    const trails = [
      inclinedTrail(53, 0),
      inclinedTrail(53, 90),
      inclinedTrail(70, 200),
      inclinedTrail(97.6, 300),
    ]
    const index = indexOf(trails)

    /* Ground truth: take a vertex of a known trail, project it, and ask the
       pick about that very pixel. The right answer is that trail, by
       construction. */
    let tested = 0
    let exact = 0
    for (let satellite = 0; satellite < trails.length; satellite++) {
      for (let v = 0; v < SWARM_TRAIL_POINTS - 1; v += 7) {
        const p = trails[satellite][v]
        const screen = project(p.mercatorX, p.mercatorY, p.elevationM)
        if (!screen) continue // behind the limb: not drawn, so not pickable
        if (screen.x < 5 || screen.x > WIDTH - 5 || screen.y < 5 || screen.y > HEIGHT - 5) continue
        const candidates = index.candidatesAt(p.mercatorX, p.mercatorY)
        const found = nearestCandidateSegment(index, candidates, screen.x, screen.y, project)
        tested++
        if (found?.satellite === satellite) exact++
      }
    }
    expect(tested).toBeGreaterThan(20)
    expect(exact).toBe(tested)
  })

  it('refuses a trail hidden behind the planet', () => {
    const index = indexOf([inclinedTrail(53, 0)])
    /* The far side, a full 180 degrees from the camera: every vertex there is
       occluded, so nothing may be picked however close the pixel is. */
    const behind = toMercator(180, 0)
    const screen = project(behind.mercatorX, behind.mercatorY, 550_000)
    expect(screen).toBeNull()

    const candidates = index.candidatesAt(behind.mercatorX, behind.mercatorY)
    const found = nearestCandidateSegment(index, candidates, WIDTH / 2, HEIGHT / 2, project)
    expect(found).toBeNull()
  })

  it('keeps the answer stable as the constellation grows around it', () => {
    const target = inclinedTrail(53, 0)
    const crowd = [target]
    for (let i = 1; i < 40; i++) crowd.push(inclinedTrail(53, (i * 360) / 40))
    const index = indexOf(crowd)

    const p = target[10]
    const screen = project(p.mercatorX, p.mercatorY, p.elevationM)
    expect(screen).not.toBeNull()
    const candidates = index.candidatesAt(p.mercatorX, p.mercatorY)
    const found = nearestCandidateSegment(index, candidates, screen!.x, screen!.y, project)
    /* With forty overlapping rings the nearest one still has to be THIS one:
       the pixel is on its vertex, so its distance is zero. */
    expect(found?.satellite).toBe(0)
    expect(found?.distancePx).toBeLessThan(0.001)
  })

  it('answers about the CURRENT geometry after a looped re-production', () => {
    /*
     * The looping producer overwrites every trail about once a minute, and
     * the index skips the bucket re-push when the trail has barely moved.
     * The promise that skip rests on: the exact stage reads the OVERWRITTEN
     * data, so the answer tracks the fresh geometry even through a skipped
     * re-index, and a delivery that DOES move far gets re-indexed and found
     * at its new place.
     */
    const index = createSwarmPickIndex()
    index.reset(2)
    const pack = (trails: SwarmTrailPoint[][]) => {
      const packed = new Float32Array(SWARM_TRAIL_FLOATS_PER_SATELLITE * trails.length)
      trails.forEach((trail, i) => packSwarmTrail(packed, i, trail))
      return packed
    }
    index.addBatch(pack([inclinedTrail(53, 0), inclinedTrail(53, 90)]), 0, 2)

    // A minute later: satellite 0 has crept a fraction of a degree...
    const crept = inclinedTrail(53, 0.2)
    index.addBatch(pack([crept, inclinedTrail(53, 90)]), 0, 2)
    const p = crept[10]
    const screen = project(p.mercatorX, p.mercatorY, p.elevationM)
    expect(screen).not.toBeNull()
    let candidates = index.candidatesAt(p.mercatorX, p.mercatorY)
    let found = nearestCandidateSegment(index, candidates, screen!.x, screen!.y, project)
    expect(found?.satellite).toBe(0)
    expect(found?.distancePx).toBeLessThan(0.001)

    // ...while satellite 1 is handed a genuinely different orbit plane.
    const moved = inclinedTrail(70, 250)
    index.addBatch(pack([crept, moved]), 0, 2)
    const q = moved[30]
    const qScreen = project(q.mercatorX, q.mercatorY, q.elevationM)
    expect(qScreen).not.toBeNull()
    candidates = index.candidatesAt(q.mercatorX, q.mercatorY)
    found = nearestCandidateSegment(index, candidates, qScreen!.x, qScreen!.y, project)
    expect(found?.satellite).toBe(1)
    expect(found?.distancePx).toBeLessThan(0.001)
  })

  it('prunes: the grid hands over a small fraction of the population', () => {
    const crowd = Array.from({ length: 200 }, (_, i) => inclinedTrail(53, (i * 360) / 200))
    const index = indexOf(crowd)
    const totalSegments = crowd.length * (SWARM_TRAIL_POINTS - 1)

    const p = crowd[0][20]
    const candidates = index.candidatesAt(p.mercatorX, p.mercatorY)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThan(totalSegments / 8)
  })
})
