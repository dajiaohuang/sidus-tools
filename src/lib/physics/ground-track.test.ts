import { describe, expect, it } from 'vitest'
import { EARTH_MU, EARTH_RADIUS } from './constants'
import { deltaLongitudeDeg, keplerGroundTrack } from './ground-track'
import { EARTH_ROTATION_RATE, groundTrackShiftPerOrbit } from './power'
import { meanMotionFromAltitude } from './ops'
import { orbitalPeriod } from './orbital'
import { groundTrack, parseTle } from './sgp4'

/**
 * Published SGP4 test object from Vallado, Crawford, Hujsak, Kelso,
 * "Revisiting Spacetrack Report #3", AIAA 2006-6753, CASE A (satnum 00005),
 * SGP4-VER.TLE. Copied verbatim; do not invent TEME.
 */
const VALLADO_CASE_A = {
  l1: '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  l2: '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
}

describe('keplerGroundTrack (spherical two-body, no J2)', () => {
  it('ISS-class 400 km, one rev: sampled Δlon matches −ω_E T (Vallado two-body period, IERS ω_E)', () => {
    const h = 400e3
    const motion = meanMotionFromAltitude(h, EARTH_MU, EARTH_RADIUS)
    expect(motion).toBeTruthy()
    const period = motion!.period
    const expected = groundTrackShiftPerOrbit(period)
    expect(expected).toBeTruthy()

    const epoch = new Date('2000-01-01T12:00:00.000Z')
    const track = keplerGroundTrack({
      altitudeM: h,
      inclinationRad: (51.6 * Math.PI) / 180,
      raanRad: 0,
      epoch,
      durationS: period,
      samples: 73,
    })
    expect(track.length).toBeGreaterThanOrEqual(8)
    for (const p of track) {
      expect(Number.isFinite(p.lat)).toBe(true)
      expect(Number.isFinite(p.lon)).toBe(true)
      expect(p.lat).toBeGreaterThanOrEqual(-90)
      expect(p.lat).toBeLessThanOrEqual(90)
      expect(p.lon).toBeGreaterThan(-180)
      expect(p.lon).toBeLessThanOrEqual(180)
    }
    const dLonDeg = deltaLongitudeDeg(track[0]!.lon, track[track.length - 1]!.lon)
    const expectedDeg = (expected! * 180) / Math.PI
    // Same ω_E in sampler and closed form; residual is wrap/IEEE only.
    expect(Math.abs(dLonDeg - expectedDeg)).toBeLessThan(1e-6)
  })

  it('latitude extrema equal inclination on a circular orbit (spherical)', () => {
    const iDeg = 51.6
    const motion = meanMotionFromAltitude(400e3)!
    const track = keplerGroundTrack({
      altitudeM: 400e3,
      inclinationRad: (iDeg * Math.PI) / 180,
      raanRad: 0,
      epoch: new Date('2000-01-01T12:00:00.000Z'),
      durationS: motion.period,
      samples: 181,
    })
    const maxAbsLat = Math.max(...track.map((p) => Math.abs(p.lat)))
    expect(maxAbsLat).toBeCloseTo(iDeg, 6)
  })
})

describe('groundTrack SGP4 sampler (published TLE)', () => {
  it('Vallado CASE A (AIAA 2006-6753): finite lat/lon samples over one mean period', () => {
    const parsed = parseTle(`${VALLADO_CASE_A.l1}\n${VALLADO_CASE_A.l2}`)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('CASE A TLE failed to parse')
    const start = new Date(Math.round((parsed.satrec.jdsatepoch - 2440587.5) * 86400000))
    // TLE mean motion is rad/min (satellite.js). One mean rev.
    const nRadMin = parsed.satrec.no
    const periodS = (2 * Math.PI) / (nRadMin / 60)
    const track = groundTrack(parsed.satrec, start, periodS, 48)
    expect(track.length).toBeGreaterThanOrEqual(8)
    for (const p of track) {
      expect(Number.isFinite(p.lat), `lat=${p.lat}`).toBe(true)
      expect(Number.isFinite(p.lon), `lon=${p.lon}`).toBe(true)
      expect(p.lat).toBeGreaterThanOrEqual(-90)
      expect(p.lat).toBeLessThanOrEqual(90)
      expect(p.lon).toBeGreaterThanOrEqual(-180)
      expect(p.lon).toBeLessThanOrEqual(180)
    }
  })
})

describe('groundTrackShiftPerOrbit 500 km Earth (Vallado two-body + IERS ω_E)', () => {
  it('Δlon/rev, revs/day, and ω_E match the cited teaching numbers', () => {
    const a = EARTH_RADIUS + 500e3
    const T = orbitalPeriod(EARTH_MU, a)
    const dL = groundTrackShiftPerOrbit(T)!
    const dLdeg = (dL * 180) / Math.PI
    expect(dLdeg).toBeCloseTo(-23.7188, 4)
    expect(86400 / T).toBeCloseTo(15.219, 3)
    expect(EARTH_ROTATION_RATE).toBeCloseTo(7.2921e-5, 8)
  })
})
