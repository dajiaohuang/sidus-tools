import { describe, expect, it } from 'vitest'
import {
  chordMeters,
  crossesDateLine,
  GLOBE_MERCATOR_MAX_LAT_DEG,
  GLOBE_RADIUS_M,
  haversineMeters,
  isPolarWrap,
  lonLatToMercator,
  smoothFollowHeading,
  trailSegmentConnects,
  WEB_MERCATOR_MAX_LAT_DEG,
} from './track'

describe('trailSegmentConnects', () => {
  it('keeps a LEO step of a few degrees', () => {
    expect(trailSegmentConnects({ lon: 10, lat: 51.6 }, { lon: 12, lat: 51.8 })).toBe(true)
  })

  it('breaks a date-line step unless the caller can wrap it', () => {
    const a = { lon: 179.5, lat: 10 }
    const b = { lon: -179.5, lat: 10 }
    expect(crossesDateLine(a, b)).toBe(true)
    expect(trailSegmentConnects(a, b)).toBe(false)
    expect(trailSegmentConnects(a, b, true)).toBe(true)
  })

  it('breaks a chord that goes through the Earth, not a perigee step of a real ellipse', () => {
    const through = { lon: 0, lat: 0, altKm: 20_000 }
    const opposite = { lon: 180, lat: 0, altKm: 20_000 }
    expect(trailSegmentConnects(through, opposite)).toBe(false)
    expect(
      trailSegmentConnects({ lon: 0, lat: 10, altKm: 8_000 }, { lon: 12, lat: 14, altKm: 7_000 }),
    ).toBe(true)
  })

  it('keeps an elevated inertial step whose ground angle is large but the chord stays outside Earth', () => {
    expect(
      trailSegmentConnects({ lon: 0, lat: 10, altKm: 8_000 }, { lon: 8, lat: 12, altKm: 8_000 }),
    ).toBe(true)
  })

  it('keeps a polar step whose longitude jumps but the chord is short', () => {
    expect(trailSegmentConnects({ lon: 10, lat: 82 }, { lon: 50, lat: 83 })).toBe(true)
  })
})

describe('chordMeters', () => {
  it('is longer than the ground haversine once the samples leave the surface', () => {
    const a = { lon: 0, lat: 0, altKm: 400 }
    const b = { lon: 1, lat: 0, altKm: 400 }
    expect(chordMeters(a, b)).toBeGreaterThan(haversineMeters(a, b))
    expect(chordMeters(a, b) / haversineMeters(a, b)).toBeCloseTo(
      (GLOBE_RADIUS_M + 400_000) / GLOBE_RADIUS_M,
      2,
    )
  })
})

describe('lonLatToMercator / polar wrap', () => {
  it('puts 89° north outside web-mercator [0, 1] so the globe shader can reach the pole', () => {
    const web = lonLatToMercator(0, WEB_MERCATOR_MAX_LAT_DEG, WEB_MERCATOR_MAX_LAT_DEG)
    expect(web.y).toBeCloseTo(0, 5)
    const polar = lonLatToMercator(0, 89, GLOBE_MERCATOR_MAX_LAT_DEG)
    expect(polar.y).toBeLessThan(0)
  })

  it('flags a longitude jump near a pole, not a date-line step at the equator', () => {
    expect(isPolarWrap({ lon: 10, lat: 88 }, { lon: 170, lat: 87 })).toBe(true)
    expect(isPolarWrap({ lon: 179, lat: 0 }, { lon: -179, lat: 0 })).toBe(false)
  })
})

describe('smoothFollowHeading', () => {
  it('takes the first sample as-is and then walks the short arc', () => {
    const held = { current: null as number | null }
    expect(smoothFollowHeading(held, 10, 1)).toBeCloseTo(10, 9)
    expect(smoothFollowHeading(held, 350, 0.5)).toBeCloseTo(0, 5)
  })
})
