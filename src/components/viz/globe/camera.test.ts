import { describe, expect, it } from 'vitest'
import { EARTH_RADIUS } from '@/lib/physics/constants'
import {
  cameraDistanceInRadii,
  centerForElevatedTarget,
  destinationPoint,
  initialBearingDeg,
  elevatedCenterLeadRad,
  followZoomCeiling,
  globeScreenRadiusPx,
  latCompensatedZoom,
  skyAimCamera,
  SKY_AIM_PITCH_DEG,
  SKY_AIM_ABOVE_CENTER_DEG,
  FOLLOW_CAMERA_ALTITUDE_MARGIN,
  followPitchDeg,
  frameSatelliteCamera,
  FRAME_ZOOM_SLACK,
  wrapLngDeg,
  autoRotateLngDeg,
  AUTO_ROTATE_MAX_DT_S,
} from './camera'
import { GLOBE_RADIUS_M } from './track'
import { sphereDirection } from './sun'

const DEG = Math.PI / 180
const TILE_SIZE_PX = 512
const ISS_ALTITUDE_M = 425_000
/** MapLibre's default vertical field of view. */
const FOV_RAD = 36.87 * DEG
const CANVAS_H = 900

/** MapLibre's own camera-to-centre distance, in Earth radii, at a given zoom. */
function cameraDistanceOverEarthRadius(zoom: number, canvasH: number, lat: number): number {
  return (
    (Math.PI * canvasH * Math.cos(lat * DEG)) /
    (TILE_SIZE_PX * Math.tan(FOV_RAD / 2) * Math.pow(2, zoom))
  )
}

/** Distance from Earth's centre to the camera, in Earth radii. */
function cameraRadiiAt(zoom: number, pitchDeg: number, canvasH: number, lat: number): number {
  const u = cameraDistanceOverEarthRadius(zoom, canvasH, lat)
  return Math.sqrt(1 + 2 * u * Math.cos(pitchDeg * DEG) + u * u)
}

/** A clipping plane for a camera `distance` Earth radii out, as MapLibre packs it. */
function clippingPlaneAt(distance: number, scale = 1): [number, number, number, number] {
  return [0, 0, scale, (-scale / distance) * 1]
}

describe('followZoomCeiling', () => {
  it('leaves the zoom free with no altitude to centre', () => {
    expect(
      followZoomCeiling({
        pitchDeg: 60,
        altitudeM: 0,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg: 0,
      }),
    ).toBe(Infinity)
  })

  it('puts the camera exactly at the required margin above the target', () => {
    for (const pitchDeg of [0, 20, 40, 60, 80]) {
      const zoom = followZoomCeiling({
        pitchDeg,
        altitudeM: ISS_ALTITUDE_M,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg: 0,
      })
      const expected = 1 + (FOLLOW_CAMERA_ALTITUDE_MARGIN * ISS_ALTITUDE_M) / EARTH_RADIUS
      expect(cameraRadiiAt(zoom, pitchDeg, CANVAS_H, 0)).toBeCloseTo(expected, 9)
    }
  })

  it('always clears the bare geometric limit, so the aiming ray can reach the ground', () => {
    for (let pitchDeg = 0; pitchDeg <= 80; pitchDeg += 5) {
      const zoom = followZoomCeiling({
        pitchDeg,
        altitudeM: ISS_ALTITUDE_M,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg: 0,
      })
      expect(cameraRadiiAt(zoom, pitchDeg, CANVAS_H, 0)).toBeGreaterThan(
        1 + ISS_ALTITUDE_M / EARTH_RADIUS,
      )
    }
  })

  it('falls monotonically as the tilt steepens', () => {
    let previous = Infinity
    for (let pitchDeg = 0; pitchDeg <= 80; pitchDeg += 5) {
      const zoom = followZoomCeiling({
        pitchDeg,
        altitudeM: ISS_ALTITUDE_M,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg: 0,
      })
      expect(zoom).toBeLessThan(previous)
      previous = zoom
    }
  })

  it('falls as the target climbs: a higher orbit needs a wider shot', () => {
    const at = (altitudeM: number) =>
      followZoomCeiling({
        pitchDeg: 45,
        altitudeM,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg: 0,
      })
    expect(at(800_000)).toBeLessThan(at(400_000))
    expect(at(35_786_000)).toBeLessThan(at(800_000))
  })

  it('tightens toward the poles, where MapLibre scales the globe up', () => {
    const at = (centerLatDeg: number) =>
      followZoomCeiling({
        pitchDeg: 45,
        altitudeM: ISS_ALTITUDE_M,
        fovRad: FOV_RAD,
        canvasCssHeight: CANVAS_H,
        centerLatDeg,
      })
    expect(at(51.6)).toBeLessThan(at(0))
    expect(at(-51.6)).toBeCloseTo(at(51.6), 12)
  })

  it('rises with a taller canvas: more pixels put the camera further out', () => {
    const at = (canvasCssHeight: number) =>
      followZoomCeiling({
        pitchDeg: 45,
        altitudeM: ISS_ALTITUDE_M,
        fovRad: FOV_RAD,
        canvasCssHeight,
        centerLatDeg: 0,
      })
    expect(at(1800) - at(900)).toBeCloseTo(1, 12)
  })
})

describe('frameSatelliteCamera', () => {
  const canvas = { fovRad: FOV_RAD, canvasCssHeight: CANVAS_H }

  it('looks straight down on a ground marker, north up', () => {
    const pose = frameSatelliteCamera({
      lonDeg: 12,
      latDeg: 45,
      altitudeM: 400_000,
      elevated: false,
      ...canvas,
    })
    expect(pose.lonDeg).toBe(12)
    expect(pose.latDeg).toBe(45)
    expect(pose.pitchDeg).toBe(0)
    expect(pose.bearingDeg).toBe(0)
    expect(pose.zoom).toBe(3.5)
  })

  it('keeps LEO on the camera–Earth line without a chase pitch', () => {
    const pose = frameSatelliteCamera({
      lonDeg: 10,
      latDeg: 20,
      altitudeM: ISS_ALTITUDE_M,
      elevated: true,
      ...canvas,
    })
    expect(pose.lonDeg).toBe(10)
    expect(pose.latDeg).toBe(20)
    expect(pose.pitchDeg).toBe(0)
    expect(pose.bearingDeg).toBe(0)
    expect(cameraRadiiAt(pose.zoom, pose.pitchDeg, CANVAS_H, pose.latDeg)).toBeGreaterThan(
      1 + ISS_ALTITUDE_M / EARTH_RADIUS,
    )
  })

  it('looks down on a high elliptical and zooms out past it, not into the planet', () => {
    /** ARKTIKA-M class: Molniya apogee, well outside the globe. */
    const ARKTIKA_APOGEE_M = 40_000_000
    const pose = frameSatelliteCamera({
      lonDeg: 80,
      latDeg: 63,
      altitudeM: ARKTIKA_APOGEE_M,
      elevated: true,
      ...canvas,
    })
    expect(pose.pitchDeg).toBe(0)
    expect(pose.bearingDeg).toBe(0)
    expect(pose.zoom).toBeLessThan(1)
    expect(cameraRadiiAt(pose.zoom, pose.pitchDeg, CANVAS_H, pose.latDeg)).toBeGreaterThan(
      1 + ARKTIKA_APOGEE_M / EARTH_RADIUS,
    )
  })

  it('is wider than the geometric ceiling by the framing slack', () => {
    const pose = frameSatelliteCamera({
      lonDeg: 0,
      latDeg: 0,
      altitudeM: ISS_ALTITUDE_M,
      elevated: true,
      ...canvas,
    })
    const ceiling = followZoomCeiling({
      pitchDeg: 0,
      altitudeM: ISS_ALTITUDE_M,
      fovRad: FOV_RAD,
      canvasCssHeight: CANVAS_H,
      centerLatDeg: pose.latDeg,
    })
    expect(ceiling - pose.zoom).toBeCloseTo(FRAME_ZOOM_SLACK, 12)
  })
})

describe('latCompensatedZoom', () => {
  it('returns the same zoom when the latitude does not change', () => {
    expect(latCompensatedZoom(5, 30, 30)).toBe(5)
  })

  it('steps exactly one zoom level for the equator-to-60-degree benchmark', () => {
    expect(latCompensatedZoom(5, 0, 60)).toBeCloseTo(4, 10)
    expect(latCompensatedZoom(5, 60, 0)).toBeCloseTo(6, 10)
  })

  it('round-trips back to the original zoom', () => {
    expect(latCompensatedZoom(latCompensatedZoom(5, 0, 47.3), 47.3, 0)).toBeCloseTo(5, 10)
  })

  it('refuses a latitude at or beyond the poles, and NaN, as undefined', () => {
    expect(latCompensatedZoom(5, 30, 90)).toBe(5)
    expect(latCompensatedZoom(5, 90, 30)).toBe(5)
    expect(latCompensatedZoom(5, Number.NaN, 10)).toBe(5)
  })
})

describe('elevatedCenterLeadRad', () => {
  const rho = 1 + ISS_ALTITUDE_M / GLOBE_RADIUS_M

  it('is zero looking straight down, and with nothing elevated', () => {
    expect(elevatedCenterLeadRad(0, ISS_ALTITUDE_M)).toBe(0)
    expect(elevatedCenterLeadRad(60, 0)).toBe(0)
  })

  it('satisfies the collinearity condition rho*sin(p - g) = sin(p)', () => {
    for (let pitchDeg = 0; pitchDeg <= 80; pitchDeg += 5) {
      const lead = elevatedCenterLeadRad(pitchDeg, ISS_ALTITUDE_M)
      const pitch = pitchDeg * DEG
      expect(rho * Math.sin(pitch - lead)).toBeCloseTo(Math.sin(pitch), 12)
    }
  })

  it('grows with the tilt and with the target altitude', () => {
    let previous = -1
    for (let pitchDeg = 0; pitchDeg <= 80; pitchDeg += 5) {
      const lead = elevatedCenterLeadRad(pitchDeg, ISS_ALTITUDE_M)
      expect(lead).toBeGreaterThanOrEqual(previous)
      previous = lead
    }
    expect(elevatedCenterLeadRad(60, 800_000)).toBeGreaterThan(
      elevatedCenterLeadRad(60, 400_000),
    )
  })

  it('stays finite and bounded as the tilt approaches the horizontal', () => {
    const lead = elevatedCenterLeadRad(90, ISS_ALTITUDE_M)
    expect(Number.isFinite(lead)).toBe(true)
    expect(lead).toBeLessThan(Math.PI / 2)
    expect(lead).toBeGreaterThan(0)
  })

  it('does not depend on the zoom, unlike the ceiling', () => {
    // The derivation cancels the camera distance; only tilt and radius remain.
    expect(elevatedCenterLeadRad(45, ISS_ALTITUDE_M)).toBeCloseTo(
      elevatedCenterLeadRad(45, ISS_ALTITUDE_M),
      15,
    )
    expect(elevatedCenterLeadRad(45, ISS_ALTITUDE_M)).toBeGreaterThan(0)
  })
})

describe('destinationPoint', () => {
  /** Great-circle angle between two lon/lat points, radians. */
  const separation = (a: { lonDeg: number; latDeg: number }, b: { lonDeg: number; latDeg: number }) => {
    const toVec = (p: { lonDeg: number; latDeg: number }) => {
      const lat = p.latDeg * DEG
      const lon = p.lonDeg * DEG
      return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
    }
    const [x1, y1, z1] = toVec(a)
    const [x2, y2, z2] = toVec(b)
    return Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2)))
  }

  it('lands exactly the requested angle away, at any bearing', () => {
    const start = { lonDeg: 12.5, latDeg: 41.9 }
    for (const bearing of [0, 45, 90, 180, 270, 359]) {
      for (const angle of [0.001, 0.05, 0.36]) {
        const end = destinationPoint(start.lonDeg, start.latDeg, bearing, angle)
        expect(separation(start, end)).toBeCloseTo(angle, 10)
      }
    }
  })

  it('goes due north and due south along the meridian', () => {
    const north = destinationPoint(30, 10, 0, 5 * DEG)
    expect(north.latDeg).toBeCloseTo(15, 9)
    expect(north.lonDeg).toBeCloseTo(30, 9)
    const south = destinationPoint(30, 10, 180, 5 * DEG)
    expect(south.latDeg).toBeCloseTo(5, 9)
  })

  it('returns the start point for a zero step, and wraps longitude into range', () => {
    expect(destinationPoint(179, 0, 90, 0)).toEqual({ lonDeg: 179, latDeg: 0 })
    const wrapped = destinationPoint(179, 0, 90, 5 * DEG)
    expect(wrapped.lonDeg).toBeGreaterThanOrEqual(-180)
    expect(wrapped.lonDeg).toBeLessThan(180)
    expect(wrapped.lonDeg).toBeCloseTo(-176, 9)
  })
})

describe('centerForElevatedTarget', () => {
  /** Where a camera at `center` holding `bearing` would find the target: behind it. */
  const arrivalBearing = (
    center: { lonDeg: number; latDeg: number },
    target: { lonDeg: number; latDeg: number },
  ) => (initialBearingDeg(center.lonDeg, center.latDeg, target.lonDeg, target.latDeg) + 180) % 360

  it('leaves the centre on the target when there is no lead', () => {
    expect(centerForElevatedTarget(10, 20, 45, 0)).toEqual({ lonDeg: 10, latDeg: 20 })
  })

  it('puts the target exactly behind the camera bearing, at every latitude', () => {
    for (const latDeg of [0, 20, 45, 51.6, 70]) {
      for (const bearingDeg of [0, 37, 90, 118.5, 200, 300]) {
        for (const leadRad of [0.02, 0.1, 0.221]) {
          const center = centerForElevatedTarget(-90.5, latDeg, bearingDeg, leadRad)
          const arrival = arrivalBearing(center, { lonDeg: -90.5, latDeg })
          const error = ((arrival - bearingDeg) % 360 + 540) % 360 - 180
          // 1e-6 deg is about 11 cm of arc, comfortably above the float noise floor.
          expect(Math.abs(error)).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('differs from the naive walk exactly by the meridian convergence', () => {
    // The live case that exposed it: 50.67 deg north, bearing 118.5, 12.64 deg lead.
    const lead = 12.64 * DEG
    const solved = centerForElevatedTarget(-90.5, 50.67, 118.5, lead)
    const naive = destinationPoint(-90.5, 50.67, 118.5, lead)
    const naiveArrival = arrivalBearing(naive, { lonDeg: -90.5, latDeg: 50.67 })
    expect(Math.abs(naiveArrival - 118.5)).toBeGreaterThan(10)
    expect(Math.abs(naiveArrival - 118.5)).toBeLessThan(13)
    expect(solved.lonDeg).not.toBeCloseTo(naive.lonDeg, 2)
  })

  it('reduces to the meridian when heading due north, where nothing converges', () => {
    const center = centerForElevatedTarget(25, 10, 0, 0.15)
    expect(center.lonDeg).toBeCloseTo(25, 9)
    expect(center.latDeg).toBeGreaterThan(10)
  })

  it('does not hop meridians when a polar lead would cross the pole', () => {
    const lead = 12.7 * DEG
    const a = centerForElevatedTarget(20, 85, 0, lead)
    const b = centerForElevatedTarget(20, 85, 2, lead)
    expect(Math.abs(a.latDeg)).toBeLessThan(89.01)
    expect(Math.abs(b.latDeg)).toBeLessThan(89.01)
    const dLon = Math.abs((((a.lonDeg - b.lonDeg) % 360) + 540) % 360 - 180)
    expect(dLon).toBeLessThan(5)
  })
})

describe('skyAimCamera', () => {
  /** The camera's centre-ray direction for a given camera, in the world frame. */
  const centerRay = (aim: NonNullable<ReturnType<typeof skyAimCamera>>) => {
    const up = sphereDirection(aim.lonDeg, aim.latDeg)
    const north = sphereDirection(aim.lonDeg, aim.latDeg + 1e-6)
    // Tangent north, orthogonalised against up.
    const dotUp = north[0] * up[0] + north[1] * up[1] + north[2] * up[2]
    const n: [number, number, number] = [
      north[0] - up[0] * dotUp,
      north[1] - up[1] * dotUp,
      north[2] - up[2] * dotUp,
    ]
    const nLen = Math.hypot(...n)
    const nHat: [number, number, number] = [n[0] / nLen, n[1] / nLen, n[2] / nLen]
    // East completes the right-handed frame: east = north x up.
    const e: [number, number, number] = [
      nHat[1] * up[2] - nHat[2] * up[1],
      nHat[2] * up[0] - nHat[0] * up[2],
      nHat[0] * up[1] - nHat[1] * up[0],
    ]
    const b = aim.bearingDeg * DEG
    const p = aim.pitchDeg * DEG
    const f: [number, number, number] = [
      nHat[0] * Math.cos(b) + e[0] * Math.sin(b),
      nHat[1] * Math.cos(b) + e[1] * Math.sin(b),
      nHat[2] * Math.cos(b) + e[2] * Math.sin(b),
    ]
    return [
      -up[0] * Math.cos(p) + f[0] * Math.sin(p),
      -up[1] * Math.cos(p) + f[1] * Math.sin(p),
      -up[2] * Math.cos(p) + f[2] * Math.sin(p),
    ] as [number, number, number]
  }

  it('puts the direction exactly the requested angle above the centre ray', () => {
    for (const [lon, lat] of [[0, 0], [45, 30], [-120, -60], [170, 12], [-5, 80]]) {
      const direction = sphereDirection(lon, lat)
      const aim = skyAimCamera(direction, 10, 20)!
      const ray = centerRay(aim)
      const dot = ray[0] * direction[0] + ray[1] * direction[1] + ray[2] * direction[2]
      expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeCloseTo(SKY_AIM_ABOVE_CENTER_DEG, 5)
    }
  })

  it('aims dead centre when asked for no offset, since that is the same solve', () => {
    const direction = sphereDirection(30, -10)
    const aim = skyAimCamera(direction, 0, 0, SKY_AIM_PITCH_DEG, 0)!
    const ray = centerRay(aim)
    const dot = ray[0] * direction[0] + ray[1] * direction[1] + ray[2] * direction[2]
    expect(dot).toBeCloseTo(1, 6)
  })

  it('places the centre 180 - pitch - offset degrees from the direction sub-point', () => {
    const direction = sphereDirection(40, 15)
    const aim = skyAimCamera(direction, -30, 5)!
    const centre = sphereDirection(aim.lonDeg, aim.latDeg)
    const cosAngle = centre[0] * direction[0] + centre[1] * direction[1] + centre[2] * direction[2]
    expect((Math.acos(cosAngle) * 180) / Math.PI).toBeCloseTo(
      180 - SKY_AIM_PITCH_DEG - SKY_AIM_ABOVE_CENTER_DEG,
      6,
    )
  })

  it('turns the globe the short way, toward the current view', () => {
    const direction = sphereDirection(0, 0)
    const fromEast = skyAimCamera(direction, 150, 0)!
    const fromWest = skyAimCamera(direction, -150, 0)!
    expect(fromEast.lonDeg).toBeGreaterThan(0)
    expect(fromWest.lonDeg).toBeLessThan(0)
  })

  it('honours a different aim pitch and rejects a zero direction', () => {
    const aim = skyAimCamera(sphereDirection(0, 0), 10, 10, 45, 0)!
    expect(aim.pitchDeg).toBe(45)
    const centre = sphereDirection(aim.lonDeg, aim.latDeg)
    const direction = sphereDirection(0, 0)
    const angle = Math.acos(centre[0] * direction[0] + centre[1] * direction[1] + centre[2] * direction[2])
    expect((angle * 180) / Math.PI).toBeCloseTo(135, 6)
    expect(skyAimCamera([0, 0, 0], 0, 0)).toBeNull()
  })
})

describe('cameraDistanceInRadii', () => {
  it('recovers the distance the plane was built from, at any plane scale', () => {
    for (const distance of [1.5, 3, 12, 400]) {
      for (const scale of [1, 0.25, 7]) {
        expect(cameraDistanceInRadii(clippingPlaneAt(distance, scale))).toBeCloseTo(distance, 9)
      }
    }
  })

  it('rejects a degenerate plane', () => {
    expect(cameraDistanceInRadii([0, 0, 0, 0])).toBeNull()
    expect(cameraDistanceInRadii([0, 0, 1, 1])).toBeNull()
  })
})

describe('globeScreenRadiusPx', () => {
  it('matches the angular radius the camera distance implies', () => {
    for (const distance of [1.5, 3, 12]) {
      const radius = globeScreenRadiusPx(clippingPlaneAt(distance), FOV_RAD, CANVAS_H)
      const expected =
        (CANVAS_H / 2) * (Math.tan(Math.asin(1 / distance)) / Math.tan(FOV_RAD / 2))
      expect(radius).toBeCloseTo(expected, 9)
    }
  })

  it('shrinks as the camera pulls away', () => {
    const near = globeScreenRadiusPx(clippingPlaneAt(2), FOV_RAD, CANVAS_H)!
    const far = globeScreenRadiusPx(clippingPlaneAt(20), FOV_RAD, CANVAS_H)!
    expect(far).toBeLessThan(near)
    expect(far).toBeGreaterThan(0)
  })

  it('scales with the canvas, so the same view fills the same fraction', () => {
    const small = globeScreenRadiusPx(clippingPlaneAt(4), FOV_RAD, 600)!
    const large = globeScreenRadiusPx(clippingPlaneAt(4), FOV_RAD, 1200)!
    expect(large / small).toBeCloseTo(2, 12)
  })

  it('rejects a camera inside the planet', () => {
    expect(globeScreenRadiusPx(clippingPlaneAt(0.5), FOV_RAD, CANVAS_H)).toBeNull()
  })
})

describe('followPitchDeg', () => {
  it('keeps the leaning chase for LEO', () => {
    // The ISS at ~420 km keeps almost all of the 80-degree lean.
    expect(followPitchDeg(420_000, 80)).toBeCloseTo(74.7, 1)
  })

  it('goes top-down for navigation and geosynchronous orbits', () => {
    /*
     * At navigation and geosynchronous altitude an 80-degree entry pitch
     * yields an elevated-centre lead of most of a hemisphere and a zoom
     * ceiling near one: the camera would fly to the far side of the planet.
     * Straight down, the lead is zero by construction and the satellite
     * sits on the centre.
     */
    expect(followPitchDeg(21_500_000, 80)).toBe(0)
    expect(followPitchDeg(35_786_000, 80)).toBe(0)
  })

  it('degrades continuously in between', () => {
    const half = followPitchDeg(6_371_008.8 / 2, 80)
    expect(half).toBeCloseTo(40, 5)
    expect(followPitchDeg(0, 80)).toBe(80)
  })
})

describe('autoRotateLngDeg', () => {
  it('wraps through the antimeridian the short way', () => {
    expect(wrapLngDeg(181)).toBe(-179)
    expect(wrapLngDeg(-181)).toBe(179)
    expect(autoRotateLngDeg(179.9, 6, 1)).toBeCloseTo(-179.9, 10)
  })

  it('does not spend a hitch as one jump', () => {
    const drifted = autoRotateLngDeg(0, 1.5, 2)
    expect(drifted).toBeCloseTo(1.5 * AUTO_ROTATE_MAX_DT_S, 10)
  })
})
