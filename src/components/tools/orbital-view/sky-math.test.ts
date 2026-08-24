import { describe, expect, it } from 'vitest'
import { gmstRad } from '@/lib/physics'
import {
  eclipticLonLatDeg,
  formatAngularDiameter,
  formatSignedDeg,
  inertialDirectionOf,
  phaseAngleRad,
  spinDirection,
  worldDirectionOf,
  OBLIQUITY_RAD,
} from './sky-math'

describe('eclipticLonLatDeg', () => {
  it('puts the vernal equinox at the origin of ecliptic longitude', () => {
    const { lonDeg, latDeg } = eclipticLonLatDeg([1, 0, 0])
    expect(lonDeg).toBeCloseTo(0, 9)
    expect(latDeg).toBeCloseTo(0, 9)
  })

  it('turns the equatorial pole onto the obliquity', () => {
    // +z equatorial is 90 deg from the ecliptic plane less the obliquity.
    const { latDeg } = eclipticLonLatDeg([0, 0, 1])
    expect(latDeg).toBeCloseTo(90 - (OBLIQUITY_RAD * 180) / Math.PI, 6)
  })

  it('reports longitude in [0, 360)', () => {
    const { lonDeg } = eclipticLonLatDeg([-1, -0.0001, 0])
    expect(lonDeg).toBeGreaterThanOrEqual(0)
    expect(lonDeg).toBeLessThan(360)
  })
})

describe('formatAngularDiameter', () => {
  it('uses degrees for a disk you can see', () => {
    expect(formatAngularDiameter(0.532)).toBe('0.532°')
  })

  it('uses arcseconds for one you cannot', () => {
    expect(formatAngularDiameter(0.0086)).toBe('31.0″')
  })
})

describe('formatSignedDeg', () => {
  it('signs a positive value and leaves a negative one alone', () => {
    expect(formatSignedDeg(1.5)).toBe('+1.50')
    expect(formatSignedDeg(-1.5)).toBe('-1.50')
  })

  it('never prints a negative zero, which reads as a fault', () => {
    expect(formatSignedDeg(-0.001)).toBe('0.00')
    expect(formatSignedDeg(0)).toBe('0.00')
  })
})

describe('phaseAngleRad', () => {
  it('is zero when the body is fully lit from where we stand', () => {
    // Body beyond the Sun: we see the lit face, which is phase angle zero.
    expect(phaseAngleRad([2, 0, 0], [1, 0, 0])).toBeCloseTo(0, 6)
  })

  it('is pi when the body sits between us and the Sun', () => {
    // The lit face points away: new, which is phase angle pi.
    expect(phaseAngleRad([1, 0, 0], [2, 0, 0])).toBeCloseTo(Math.PI, 6)
  })

  it('is a right angle at quadrature', () => {
    expect(phaseAngleRad([1, 0, 0], [1, 1, 0])).toBeCloseTo(Math.PI / 2, 6)
  })
})

describe('the inertial sky', () => {
  it('spins back onto the Earth-fixed frame exactly, at any hour', () => {
    /*
     * The one equality the smooth sky stands on: a stored inertial direction,
     * spun by minus the current sidereal angle at draw time, must be the same
     * direction the Earth-fixed chain would have produced for that instant.
     * If these ever part, either the cache or the draw is in the wrong frame,
     * and the failure mode is the sky teleporting once per ephemeris tick.
     */
    const eci = [1.2e11, -0.7e11, 0.4e11] as const
    for (const hour of [0, 3, 7.5, 12, 18, 23]) {
      const date = new Date(Date.parse('2026-08-24T00:00:00Z') + hour * 3_600_000)
      const spun = spinDirection(inertialDirectionOf(eci), -gmstRad(date))
      const fixed = worldDirectionOf(eci, date)
      for (let i = 0; i < 3; i++) expect(spun[i]).toBeCloseTo(fixed[i], 10)
    }
  })

  it('keeps a stored direction independent of the clock', () => {
    // Inertial means inertial: no instant may be baked in.
    const eci = [5e10, 5e10, 1e10] as const
    expect(inertialDirectionOf(eci)).toEqual(inertialDirectionOf(eci))
  })

  it('spins about the pole and nothing else', () => {
    const d = inertialDirectionOf([3e10, 4e10, 1.2e10])
    const spun = spinDirection(d, 1.234)
    expect(spun[1]).toBeCloseTo(d[1], 12) // latitude untouched
    expect(Math.hypot(...spun)).toBeCloseTo(Math.hypot(...d), 12) // still unit-ish
    // A full turn is the identity.
    const round = spinDirection(spinDirection(d, Math.PI), Math.PI)
    for (let i = 0; i < 3; i++) expect(round[i]).toBeCloseTo(d[i], 10)
  })
})
