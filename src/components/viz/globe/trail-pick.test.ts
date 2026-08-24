import { describe, expect, it } from 'vitest'
import {
  pickNearestTrail,
  trailScreenBounds,
  TRAIL_PICK_RADIUS_PX,
  type ScreenPoint,
  type TrailPolyline,
} from './trail-pick'
import { projectElevatedToScreen } from './projection'
import { isPointOccludedByGlobe, sphereDirection } from './sun'
import { GLOBE_RADIUS_M } from './track'
import type { ProjectionData } from 'maplibre-gl'
import type { GlobeTrackPoint } from './types'

/** A straight run of points, for the geometric cases. */
function line(from: ScreenPoint, to: ScreenPoint, count = 20): ScreenPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / (count - 1),
    y: from.y + ((to.y - from.y) * i) / (count - 1),
  }))
}

describe('trailScreenBounds', () => {
  it('spans only the drawable samples', () => {
    const bounds = trailScreenBounds([{ x: 10, y: 20 }, null, { x: 40, y: 5 }])
    expect(bounds).toEqual({ minX: 10, minY: 5, maxX: 40, maxY: 20 })
  })

  it('is null when nothing is drawable', () => {
    expect(trailScreenBounds([null, null])).toBeNull()
  })
})

describe('pickNearestTrail', () => {
  it('catches a pointer sitting on the line', () => {
    const trails: TrailPolyline[] = [{ id: 'A', screen: line({ x: 100, y: 100 }, { x: 300, y: 100 }) }]
    const found = pickNearestTrail(trails, 200, 100)
    expect(found?.id).toBe('A')
    expect(found?.distancePx).toBeLessThan(0.5)
  })

  it('lets go beyond the threshold', () => {
    const trails: TrailPolyline[] = [{ id: 'A', screen: line({ x: 100, y: 100 }, { x: 300, y: 100 }) }]
    expect(pickNearestTrail(trails, 200, 100 + TRAIL_PICK_RADIUS_PX - 1)).not.toBeNull()
    expect(pickNearestTrail(trails, 200, 100 + TRAIL_PICK_RADIUS_PX + 1)).toBeNull()
  })

  it('gives crossing trails to the nearer one', () => {
    /* Two orbits crossing near (200, 100). The pointer sits a little below the
       horizontal one, so that is the line it is on. */
    const trails: TrailPolyline[] = [
      { id: 'horizontal', screen: line({ x: 100, y: 100 }, { x: 300, y: 100 }) },
      { id: 'diagonal', screen: line({ x: 100, y: 20 }, { x: 300, y: 180 }) },
    ]
    const found = pickNearestTrail(trails, 196, 102)
    expect(found?.id).toBe('horizontal')

    // And a pointer on the diagonal takes the diagonal.
    const other = pickNearestTrail(trails, 260, 148)
    expect(other?.id).toBe('diagonal')
  })

  it('ignores a section the caller marked undrawable', () => {
    /* The far side of the globe arrives as nulls. The pointer sits exactly
       where the hidden samples would have been. */
    const hidden = line({ x: 100, y: 100 }, { x: 300, y: 100 }).map((point, i) =>
      i > 5 && i < 15 ? null : point,
    )
    expect(pickNearestTrail([{ id: 'A', screen: hidden }], 200, 100)).toBeNull()
    // The visible part of the same trail is still pickable.
    expect(pickNearestTrail([{ id: 'A', screen: hidden }], 110, 100)?.id).toBe('A')
  })

  it('does not join across a break', () => {
    /* Two separated runs must not be bridged by a segment that was never
       drawn: a pointer in the gap catches nothing. */
    const split: (ScreenPoint | null)[] = [
      ...line({ x: 100, y: 100 }, { x: 140, y: 100 }, 5),
      null,
      ...line({ x: 260, y: 100 }, { x: 300, y: 100 }, 5),
    ]
    expect(pickNearestTrail([{ id: 'A', screen: split }], 200, 100)).toBeNull()
  })

  it('prunes by bounds without rejecting a trail that would have won', () => {
    const trails: TrailPolyline[] = [
      { id: 'near', screen: line({ x: 100, y: 100 }, { x: 300, y: 100 }) },
      { id: 'far', screen: line({ x: 900, y: 900 }, { x: 1000, y: 900 }) },
    ]
    // Only the near trail is even tested.
    const found = pickNearestTrail(trails, 200, 103)
    expect(found?.id).toBe('near')
    expect(found?.tested).toBe(1)

    // A pointer just outside the bounds but within the threshold still wins.
    const edge = pickNearestTrail(trails, 300 + TRAIL_PICK_RADIUS_PX - 1, 100)
    expect(edge?.id).toBe('near')
  })
})

/** A perspective camera on +Z, matching the synthetic one used for the swarm. */
const WIDTH = 1200
const HEIGHT = 800
/** Far enough out that a 20,200 km orbit is in front of the camera, not behind it. */
const CAMERA_D = 12
function syntheticProjection(): ProjectionData {
  const f = 1 / Math.tan((45 * (Math.PI / 180)) / 2)
  const near = 0.1
  const far = 100
  const p10 = (far + near) / (near - far)
  const p14 = (2 * far * near) / (near - far)
  const m = new Float64Array(16)
  m[0] = f / (WIDTH / HEIGHT)
  m[5] = f
  m[10] = p10
  m[11] = -1
  m[14] = -CAMERA_D * p10 + p14
  m[15] = CAMERA_D
  return {
    mainMatrix: m,
    fallbackMatrix: m,
    tileMercatorCoords: [0, 0, 1, 1],
    clippingPlane: [0, 0, 1, -1 / CAMERA_D],
    projectionTransition: 1,
  } as unknown as ProjectionData
}

const projection = syntheticProjection()

/** The caller's projector, mirroring GlobeMap.projectTrackPoint. */
function projectTrackPoint(point: GlobeTrackPoint, elevated: boolean) {
  const elevationM = elevated ? point.altKm * 1000 : 0
  const unit = sphereDirection(point.lon, point.lat)
  const scale = 1 + elevationM / GLOBE_RADIUS_M
  if (
    isPointOccludedByGlobe(
      [unit[0] * scale, unit[1] * scale, unit[2] * scale],
      projection.clippingPlane as [number, number, number, number],
    )
  ) {
    return null
  }
  return projectElevatedToScreen(point.lon, point.lat, elevationM, projection, WIDTH, HEIGHT, 'globe')
}

/** A GPS-height arc across the face of the globe. */
function gpsArc(): GlobeTrackPoint[] {
  return Array.from({ length: 60 }, (_, i) => ({
    lon: -40 + (80 * i) / 59,
    lat: 20,
    altKm: 20200,
    date: new Date(0),
  }))
}

describe('altitude changes where a trail can be picked', () => {
  it('picks the elevated line when altitude is on and the ground line when it is off', () => {
    const points = gpsArc()
    const elevated = points.map((p) => projectTrackPoint(p, true))
    const ground = points.map((p) => projectTrackPoint(p, false))

    const middle = Math.floor(points.length / 2)
    expect(elevated[middle]).not.toBeNull()
    expect(ground[middle]).not.toBeNull()

    /* At 20,200 km the two chains put the same sample in very different
       places, which is exactly why the pick has to use the drawn one. */
    const gap = Math.hypot(
      elevated[middle]!.x - ground[middle]!.x,
      elevated[middle]!.y - ground[middle]!.y,
    )
    expect(gap).toBeGreaterThan(TRAIL_PICK_RADIUS_PX * 5)

    // Each mode catches its own line and not the other's.
    const onTrails: TrailPolyline[] = [{ id: 'GPS', screen: elevated }]
    const offTrails: TrailPolyline[] = [{ id: 'GPS', screen: ground }]
    expect(pickNearestTrail(onTrails, elevated[middle]!.x, elevated[middle]!.y)?.id).toBe('GPS')
    expect(pickNearestTrail(onTrails, ground[middle]!.x, ground[middle]!.y)).toBeNull()
    expect(pickNearestTrail(offTrails, ground[middle]!.x, ground[middle]!.y)?.id).toBe('GPS')
    expect(pickNearestTrail(offTrails, elevated[middle]!.x, elevated[middle]!.y)).toBeNull()
  })

  it('refuses the half of an orbit hidden behind the planet', () => {
    /* A full ring at GPS height: the far side must arrive as nulls and be
       unpickable, while the near side is picked. */
    const ring: GlobeTrackPoint[] = Array.from({ length: 120 }, (_, i) => ({
      lon: -180 + (360 * i) / 119,
      lat: 0,
      altKm: 20200,
      date: new Date(0),
    }))
    const screen = ring.map((p) => projectTrackPoint(p, true))
    const drawn = screen.filter((point) => point !== null).length
    expect(drawn).toBeGreaterThan(0)
    expect(drawn).toBeLessThan(ring.length) // some of it IS hidden

    const behind = ring.findIndex((p) => Math.abs(p.lon) < 3)
    // lon 0 faces the camera, so it is drawn; the antipode is not.
    expect(screen[behind]).not.toBeNull()
    const antipode = ring.findIndex((p) => Math.abs(Math.abs(p.lon) - 180) < 3)
    expect(screen[antipode]).toBeNull()
  })
})
