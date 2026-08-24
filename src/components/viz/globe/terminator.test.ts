import { describe, expect, it } from 'vitest'
import { eciSiToGeodetic, sunEciSi } from '@/lib/physics'
import { gstime } from '@/lib/vendor/satellite-js-pure'
import {
  antipode,
  DAYLIGHT_BANDS,
  daylightBands,
  litCapRadiusDeg,
  MAX_MERCATOR_LAT_DEG,
  wrapLonDeg,
} from './terminator'

/** Subsolar point [deg] from the same physics the tools feed the globe. */
function subsolarAt(date: Date): { lat: number; lon: number } {
  const g = eciSiToGeodetic(sunEciSi(date), date)
  if (!g) throw new Error('subsolar point unavailable')
  return { lat: g.latDeg, lon: g.lonDeg }
}

function isInsideRing(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const straddles = yi > lat !== yj > lat
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Even-odd rule over every ring, so a polygon with a hole answers correctly.
 * Rings keep continuous longitudes that can run past the date line, so the
 * point is tried in each equivalent longitude window.
 */
function isInsidePolygon(rings: [number, number][][], lon: number, lat: number): boolean {
  const test = (x: number): boolean =>
    rings.reduce((inside, ring) => (isInsideRing(ring, x, lat) ? !inside : inside), false)
  return test(lon) || test(lon - 360) || test(lon + 360)
}

const SOLSTICE_JUNE = new Date('2026-06-21T08:24:00Z')
const SOLSTICE_DECEMBER = new Date('2026-12-21T20:50:00Z')
const EQUINOX_MARCH = new Date('2026-03-20T14:46:00Z')
const EQUINOX_SEPTEMBER = new Date('2026-09-23T00:05:00Z')
const MID_SEASON = new Date('2026-05-05T03:17:00Z')
/** Subsolar longitude near the date line, which is the awkward wrap case. */
const DATE_LINE_NOON = new Date('2026-08-20T00:00:00Z')

describe('subsolar point from the shipped ephemeris', () => {
  it('tracks the seasonal declination at solstices and equinoxes', () => {
    /*
     * Tolerances are honest for a low-precision ephemeris (about 0.01 deg)
     * sampled at a whole-minute instant rather than the exact solstice.
     */
    expect(subsolarAt(SOLSTICE_JUNE).lat).toBeCloseTo(23.44, 1)
    expect(subsolarAt(SOLSTICE_DECEMBER).lat).toBeCloseTo(-23.44, 1)
    expect(Math.abs(subsolarAt(EQUINOX_MARCH).lat)).toBeLessThan(0.6)
    expect(Math.abs(subsolarAt(EQUINOX_SEPTEMBER).lat)).toBeLessThan(0.6)
  })

  it('places the subsolar longitude at the sun right ascension minus GMST', () => {
    /*
     * Earth's rotation and its heliocentric position enter through the same
     * two shipped functions the globe uses, so this pins the two together.
     */
    const date = new Date('2026-08-20T12:00:00Z')
    const [x, y] = sunEciSi(date)
    const rightAscensionDeg = (Math.atan2(y, x) * 180) / Math.PI
    const gmstDeg = (gstime(date) * 180) / Math.PI
    const expected = wrapLonDeg(rightAscensionDeg - gmstDeg)

    expect(wrapLonDeg(subsolarAt(date).lon)).toBeCloseTo(expected, 6)
  })

  it('moves the subsolar longitude about 0.25 deg per minute westward', () => {
    const t0 = new Date('2026-08-20T12:00:00Z')
    const t1 = new Date(t0.getTime() + 60_000)
    const drift = wrapLonDeg(subsolarAt(t1).lon - subsolarAt(t0).lon)
    expect(drift).toBeGreaterThan(-0.27)
    expect(drift).toBeLessThan(-0.24)
  })
})

describe('daylight bands', () => {
  it('derives nested lit cap radii from the sun elevation thresholds', () => {
    expect(litCapRadiusDeg(-0.83)).toBeCloseTo(90.83, 6)
    expect(litCapRadiusDeg(-18)).toBeCloseTo(108, 6)
    // Faintest first: each later band is a smaller cap nearer the sun.
    const radii = DAYLIGHT_BANDS.map((b) => litCapRadiusDeg(b.sunElevationDeg))
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1])
  })

  for (const [name, date] of [
    ['June solstice', SOLSTICE_JUNE],
    ['December solstice', SOLSTICE_DECEMBER],
    ['March equinox', EQUINOX_MARCH],
    ['mid-season date', MID_SEASON],
    ['subsolar point near the date line', DATE_LINE_NOON],
  ] as const) {
    it(`lights the subsolar point in every band and leaves the antisolar point dark at ${name}`, () => {
      const sub = subsolarAt(date)
      const anti = antipode(sub.lat, sub.lon)
      const bands = daylightBands(sub.lat, sub.lon)

      expect(bands.features.map((f) => f.properties.band)).toEqual(
        DAYLIGHT_BANDS.map((b) => b.id),
      )
      for (const feature of bands.features) {
        const rings = feature.geometry.coordinates
        expect(
          isInsidePolygon(rings, wrapLonDeg(sub.lon), sub.lat),
          `subsolar lit in ${feature.properties.band}`,
        ).toBe(true)
        expect(
          isInsidePolygon(rings, anti.lon, anti.lat),
          `antisolar dark in ${feature.properties.band}`,
        ).toBe(false)
      }
    })

    it(`keeps every band ring closed and within the mercator limit at ${name}`, () => {
      const sub = subsolarAt(date)
      for (const feature of daylightBands(sub.lat, sub.lon).features) {
        for (const ring of feature.geometry.coordinates) {
          expect(ring.length).toBeGreaterThan(4)
          expect(ring[0]).toEqual(ring[ring.length - 1])
          for (const [, lat] of ring) {
            expect(Math.abs(lat)).toBeLessThanOrEqual(MAX_MERCATOR_LAT_DEG + 1e-9)
          }
        }
      }
    })
  }

  it('ends each band at its own sun elevation boundary', () => {
    /*
     * Walk away from the subsolar point along its meridian: the astronomical
     * band must reach 108 deg of angular distance and stop there, and the day
     * band must stop at 90.83.
     */
    const sub = { lat: 0, lon: 0 }
    const bands = daylightBands(sub.lat, sub.lon)
    const ringsOf = (id: string) =>
      bands.features.find((f) => f.properties.band === id)!.geometry.coordinates

    // Along the equator, angular distance from (0,0) is just longitude.
    expect(isInsidePolygon(ringsOf('day'), 90, 0)).toBe(true)
    expect(isInsidePolygon(ringsOf('day'), 91.5, 0)).toBe(false)
    expect(isInsidePolygon(ringsOf('astronomical'), 107, 0)).toBe(true)
    expect(isInsidePolygon(ringsOf('astronomical'), 109, 0)).toBe(false)
  })

  it('covers both poles when the sun is over the equator', () => {
    /*
     * At an equinox every lit cap reaches past both poles, so the polygon is a
     * full-width box with the night loop punched out of it.
     */
    const rings = daylightBands(0, 0).features.find((f) => f.properties.band === 'day')!
      .geometry.coordinates
    expect(rings.length).toBe(2)
    expect(isInsidePolygon(rings, 0, 84)).toBe(true)
    expect(isInsidePolygon(rings, 0, -84)).toBe(true)
    expect(isInsidePolygon(rings, 180, 0)).toBe(false)
  })
})
