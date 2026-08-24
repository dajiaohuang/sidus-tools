import { describe, expect, it } from 'vitest'
import {
  AXIS_OVERHANG,
  axisDirection,
  axisSamples,
  GEOMAGNETIC_POLE_LAT_DEG,
  GEOMAGNETIC_POLE_LON_DEG,
  magneticTiltDeg,
} from './axes'

const R = 6371008.8

describe('axisSamples', () => {
  it('runs from one end to the other, through the centre', () => {
    const chain = axisSamples(90, 0, R)
    // The ends stick out by the overhang; the middle sample sits at the centre.
    expect(chain[0].elevationM).toBeCloseTo(AXIS_OVERHANG * R, 3)
    expect(chain[chain.length - 1].elevationM).toBeCloseTo(AXIS_OVERHANG * R, 3)
    const middle = chain[Math.floor(chain.length / 2)]
    expect(Math.abs(middle.elevationM + R)).toBeLessThan(R * 0.03)
  })

  it('flips to the antipode past the centre, so one chain covers both ends', () => {
    const chain = axisSamples(GEOMAGNETIC_POLE_LAT_DEG, GEOMAGNETIC_POLE_LON_DEG, R)
    const south = chain[0]
    const north = chain[chain.length - 1]
    expect(north.latDeg).toBeCloseTo(GEOMAGNETIC_POLE_LAT_DEG, 6)
    expect(south.latDeg).toBeCloseTo(-GEOMAGNETIC_POLE_LAT_DEG, 6)
    /* The two ends are opposite points of one straight line, so their
       directions have to be exact negatives of each other. */
    const a = axisDirection(north.lonDeg, north.latDeg)
    const b = axisDirection(south.lonDeg, south.latDeg)
    for (let i = 0; i < 3; i++) expect(a[i] + b[i]).toBeCloseTo(0, 12)
  })

  it('goes negative inside the planet, which is what makes the line continuous', () => {
    const chain = axisSamples(90, 0, R)
    const inside = chain.filter((s) => s.elevationM < 0)
    expect(inside.length).toBeGreaterThan(chain.length / 2)
    // Nothing may be further in than the centre itself.
    for (const s of inside) expect(s.elevationM).toBeGreaterThanOrEqual(-R - 1)
  })
})

describe('the two axes are genuinely apart', () => {
  it('leans the magnetic axis about eleven degrees off the rotation one', () => {
    /*
     * The number the picture exists to show. If this ever came out at zero the
     * two lines would sit on top of each other and the second one would be
     * saying nothing, which is exactly the failure a reader could not spot by
     * looking, since one line over another still looks like one correct line.
     */
    expect(magneticTiltDeg()).toBeGreaterThan(9)
    expect(magneticTiltDeg()).toBeLessThan(12)
  })

  it('puts the rotation axis exactly on the frame polar axis', () => {
    const north = axisDirection(0, 90)
    expect(north[0]).toBeCloseTo(0, 12)
    expect(north[1]).toBeCloseTo(1, 12)
    expect(north[2]).toBeCloseTo(0, 12)
  })
})
