import { describe, expect, it } from 'vitest'
import {
  cameraBasis,
  centerOnEclipticPlane,
  eclipticFromEquatorial,
  phaseGeometry,
  poleDirectionEcliptic,
  primeMeridianDirectionEcliptic,
  projectPoint,
  reachableReturnScale,
  sampleOrbitEllipse,
  sunDirectionInView,
  zoomAtPointer,
  type SolarCamera,
} from './scene-math'
import { GLOBE_FLOOR_ZOOM, pxPerMeterAtEquatorZoom } from '../globe/scale'
import {
  AU,
  bodyOrientation,
  J2000_OBLIQUITY_RAD,
  planetElementsAt,
  PLANET_IDS,
  vdot,
  vnorm,
  type Vec3,
} from '@/lib/physics'

const EPOCH = new Date('2026-08-20T12:00:00Z')

/** Inverse of `eclipticFromEquatorial`, defined here so the test can round-trip. */
function equatorialFromEcliptic(v: Vec3): Vec3 {
  const c = Math.cos(J2000_OBLIQUITY_RAD)
  const s = Math.sin(J2000_OBLIQUITY_RAD)
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]
}

describe('sampleOrbitEllipse', () => {
  it('closes exactly: the last point repeats the first', () => {
    for (const planet of PLANET_IDS) {
      const points = sampleOrbitEllipse(planetElementsAt(planet, EPOCH))
      const first = points[0]
      const last = points[points.length - 1]
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(last[axis] - first[axis])).toBeLessThan(1e-9)
      }
    }
  })

  it('samples at least 360 points plus the closing repeat', () => {
    expect(sampleOrbitEllipse(planetElementsAt('earth', EPOCH), 12).length).toBe(361)
    expect(sampleOrbitEllipse(planetElementsAt('earth', EPOCH)).length).toBe(513)
  })

  it('traces the true ellipse, not a circle: apsides match a(1 +/- e)', () => {
    const elements = planetElementsAt('mercury', EPOCH)
    const radii = sampleOrbitEllipse(elements).map((p) => vnorm(p))
    const { a_m: a, e } = elements
    expect(Math.max(...radii) / (a * (1 + e))).toBeCloseTo(1, 4)
    expect(Math.min(...radii) / (a * (1 - e))).toBeCloseTo(1, 4)
    // Mercury's eccentricity has to survive sampling, or the scene draws circles.
    expect(Math.max(...radii) / Math.min(...radii)).toBeCloseTo((1 + e) / (1 - e), 3)
  })

  it('carries the true inclination out of the ecliptic plane', () => {
    const elements = planetElementsAt('mercury', EPOCH)
    const points = sampleOrbitEllipse(elements)
    const peak = Math.max(...points.map((p) => Math.abs(p[2]) / vnorm(p)))
    expect(Math.asin(peak)).toBeCloseTo(elements.i_rad, 6)
  })
})

describe('eclipticFromEquatorial', () => {
  it('round-trips an arbitrary vector', () => {
    const v: Vec3 = [1.3e11, -4.4e10, 7.7e9]
    const back = equatorialFromEcliptic(eclipticFromEquatorial(v))
    for (let axis = 0; axis < 3; axis++) {
      expect(back[axis]).toBeCloseTo(v[axis], 3)
    }
  })

  it('leaves the equinox axis alone and preserves length', () => {
    const v: Vec3 = [3, 4, 5]
    const rotated = eclipticFromEquatorial(v)
    expect(rotated[0]).toBe(3)
    expect(vnorm(rotated)).toBeCloseTo(vnorm(v), 12)
  })

  it('puts the equatorial pole 23.43928 deg off the ecliptic pole', () => {
    const pole = eclipticFromEquatorial([0, 0, 1])
    expect(Math.acos(pole[2])).toBeCloseTo(J2000_OBLIQUITY_RAD, 12)
  })
})

describe('cameraBasis and projectPoint', () => {
  const cam: SolarCamera = {
    bearingRad: 0.9,
    tiltRad: 0.4,
    scalePxPerM: 1e-9,
    centerM: [0, 0, 0],
  }
  const basis = cameraBasis(cam.bearingRad, cam.tiltRad)

  it('is orthonormal and right-handed', () => {
    expect(vnorm(basis.right)).toBeCloseTo(1, 12)
    expect(vnorm(basis.up)).toBeCloseTo(1, 12)
    expect(vnorm(basis.toCamera)).toBeCloseTo(1, 12)
    expect(vdot(basis.right, basis.up)).toBeCloseTo(0, 12)
    expect(vdot(basis.right, basis.toCamera)).toBeCloseTo(0, 12)
    expect(vdot(basis.up, basis.toCamera)).toBeCloseTo(0, 12)
  })

  it('keeps the ecliptic +z axis pointing up on screen for a camera above the plane', () => {
    expect(basis.up[2]).toBeGreaterThan(0)
    expect(basis.right[2]).toBe(0)
  })

  it('projects the camera centre to the viewport centre, with screen y down', () => {
    const origin = projectPoint([0, 0, 0], cam, basis, 800, 600)
    expect(origin.x).toBeCloseTo(400, 9)
    expect(origin.y).toBeCloseTo(300, 9)

    const right: Vec3 = [basis.right[0] * 1e10, basis.right[1] * 1e10, basis.right[2] * 1e10]
    expect(projectPoint(right, cam, basis, 800, 600).x).toBeCloseTo(400 + 10, 9)

    const up: Vec3 = [basis.up[0] * 1e10, basis.up[1] * 1e10, basis.up[2] * 1e10]
    expect(projectPoint(up, cam, basis, 800, 600).y).toBeCloseTo(300 - 10, 9)
  })
})

describe('centerOnEclipticPlane', () => {
  const basis = cameraBasis(0.4, 0.7)

  it('lands the centre in the ecliptic plane without moving anything on screen', () => {
    const cam: SolarCamera = {
      bearingRad: 0.4,
      tiltRad: 0.7,
      scalePxPerM: 3e-9,
      centerM: [4e10, -7e10, 9e10],
    }
    const sample: Vec3 = [1.1e11, 2e10, -3e9]
    const before = projectPoint(sample, cam, basis, 800, 600)
    const flat = { ...cam, centerM: centerOnEclipticPlane(cam.centerM, basis) }
    const after = projectPoint(sample, flat, basis, 800, 600)

    expect(flat.centerM[2]).toBeCloseTo(0, 6)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('leaves an edge-on camera alone, where the plane intersection runs away', () => {
    const edgeOn = cameraBasis(0.4, 0.01)
    const centerM: Vec3 = [4e10, -7e10, 9e10]
    expect(centerOnEclipticPlane(centerM, edgeOn)).toEqual(centerM)
  })
})

describe('zoomAtPointer', () => {
  it('holds the world point under the pointer in place', () => {
    const cam: SolarCamera = {
      bearingRad: 0.3,
      tiltRad: 0.6,
      scalePxPerM: 2e-9,
      centerM: [1e11, -2e10, 0],
    }
    const basis = cameraBasis(cam.bearingRad, cam.tiltRad)
    const w = 900
    const h = 700
    const pointer = { x: 620, y: 210 }

    // The world point on the pointer's ray: any depth works under orthographic.
    const dx = (pointer.x - w / 2) / cam.scalePxPerM
    const dy = (h / 2 - pointer.y) / cam.scalePxPerM
    const target: Vec3 = [
      cam.centerM[0] + dx * basis.right[0] + dy * basis.up[0],
      cam.centerM[1] + dx * basis.right[1] + dy * basis.up[1],
      cam.centerM[2] + dx * basis.right[2] + dy * basis.up[2],
    ]

    const zoomed = zoomAtPointer(cam, basis, pointer.x, pointer.y, w, h, 8)
    expect(zoomed.scalePxPerM).toBeCloseTo(1.6e-8, 20)
    const after = projectPoint(target, zoomed, basis, w, h)
    expect(after.x).toBeCloseTo(pointer.x, 6)
    expect(after.y).toBeCloseTo(pointer.y, 6)
  })
})

describe('sunDirectionInView', () => {
  it('points from the body back to the Sun at the origin', () => {
    // Camera straight above the ecliptic plane: screen x is ecliptic +y here.
    const basis = cameraBasis(0, Math.PI / 2)
    const sun = sunDirectionInView([0, AU, 0], basis)
    expect(sun.x).toBeCloseTo(-1, 12)
    expect(sun.y).toBeCloseTo(0, 12)
    expect(sun.z).toBeCloseTo(0, 12)
  })

  it('reports the Sun behind the body as negative depth', () => {
    const basis = cameraBasis(0, Math.PI / 2)
    const sun = sunDirectionInView([0, 0, AU], basis)
    expect(sun.z).toBeCloseTo(-1, 12)
  })
})

describe('phaseGeometry', () => {
  const R = 20

  it('lights the hemisphere facing the Sun at half phase', () => {
    const phase = phaseGeometry({ x: 1, y: 0, z: 0 }, R)
    expect(phase.sunAngleRad).toBeCloseTo(0, 12)
    expect(phase.terminatorMidPx).toBeCloseTo(0, 12)
    expect(phase.litFraction).toBeCloseTo(0.5, 12)
    expect(phase.headOn).toBe(false)
  })

  it('aims the lit side at the Sun whatever the screen angle', () => {
    for (const angle of [0, 0.7, 2.4, -1.9, Math.PI]) {
      const phase = phaseGeometry({ x: Math.cos(angle), y: Math.sin(angle), z: 0 }, R)
      expect(Math.cos(phase.sunAngleRad - angle)).toBeCloseTo(1, 12)
    }
  })

  it('bulges the terminator away from the Sun when the Sun is on the camera side', () => {
    const half = Math.SQRT1_2
    const gibbous = phaseGeometry({ x: half, y: 0, z: half }, R)
    expect(gibbous.terminatorMidPx).toBeLessThan(0)
    expect(gibbous.litFraction).toBeCloseTo((1 + half) / 2, 12)

    const crescent = phaseGeometry({ x: half, y: 0, z: -half }, R)
    expect(crescent.terminatorMidPx).toBeGreaterThan(0)
    expect(crescent.litFraction).toBeCloseTo((1 - half) / 2, 12)
    // Mirror geometries light complementary fractions of the same disk.
    expect(gibbous.litFraction + crescent.litFraction).toBeCloseTo(1, 12)
  })

  it('flags a head-on Sun, where the screen angle is undefined', () => {
    expect(phaseGeometry({ x: 0, y: 0, z: 1 }, R).headOn).toBe(true)
    expect(phaseGeometry({ x: 0, y: 0, z: 1 }, R).litFraction).toBeCloseTo(1, 12)
    expect(phaseGeometry({ x: 0, y: 0, z: -1 }, R).litFraction).toBeCloseTo(0, 12)
  })
})

describe('body orientation vectors', () => {
  it("tilts Earth's pole by its 23.4 deg obliquity from the ecliptic pole", () => {
    const pole = poleDirectionEcliptic(bodyOrientation('earth', EPOCH))
    expect((Math.acos(pole[2]) * 180) / Math.PI).toBeCloseTo(23.44, 1)
  })

  it('lays the Uranus pole almost in the ecliptic plane', () => {
    /* Uranus spins on its side. The IAU north pole is the one north of the
       invariable plane, so it sits 82.2 deg from the ecliptic pole, the
       supplement of the 97.8 deg obliquity quoted for the right-hand-rule
       spin axis. */
    const pole = poleDirectionEcliptic(bodyOrientation('uranus', EPOCH))
    expect((Math.acos(pole[2]) * 180) / Math.PI).toBeCloseTo(82.3, 0)
  })

  it('keeps the prime meridian on the equator, perpendicular to the pole', () => {
    for (const body of ['earth', 'mars', 'moon'] as const) {
      const orientation = bodyOrientation(body, EPOCH)
      const pole = poleDirectionEcliptic(orientation)
      const meridian = primeMeridianDirectionEcliptic(orientation)
      expect(vnorm(meridian)).toBeCloseTo(1, 12)
      expect(vdot(pole, meridian)).toBeCloseTo(0, 12)
    }
  })

  it('turns the prime meridian once per rotation period', () => {
    const start = primeMeridianDirectionEcliptic(bodyOrientation('earth', EPOCH))
    const day = new Date(EPOCH.getTime() + 86_164_100)
    const later = primeMeridianDirectionEcliptic(bodyOrientation('earth', day))
    // One sidereal day of rotation brings the meridian back on itself.
    expect(vdot(start, later)).toBeCloseTo(1, 5)
  })
})

describe('reachableReturnScale', () => {
  it('returns the recorded scale when it lies within the clamped zoom range', () => {
    expect(reachableReturnScale(100, 1, 5000)).toBe(100)
  })

  it('returns the reachable ceiling when the recorded scale lies beyond it', () => {
    expect(reachableReturnScale(10_000, 1, 5000)).toBe(5000)
  })

  it('passes an exact match through unchanged', () => {
    expect(reachableReturnScale(5000, 1, 5000)).toBe(5000)
  })

  it('a solar view opened from a link can still reach the globe floor before ZOOM_MAX', () => {
    const base = (800 * 0.46) / (1.7 * AU)
    const wanted = pxPerMeterAtEquatorZoom(GLOBE_FLOOR_ZOOM) * 1.1
    expect(reachableReturnScale(wanted, base, 5000)).toBe(wanted)
  })
})
