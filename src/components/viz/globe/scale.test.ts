import { describe, expect, it } from 'vitest'
import { MercatorCoordinate } from 'maplibre-gl'
import {
  AU_M,
  equatorMeterInMercatorUnits,
  formatAu,
  formatKm,
  GLOBE_FLOOR_ZOOM,
  mercatorZoomFromMetresPerPixel,
  metresPerPixel,
  pxPerMeterAtEquatorZoom,
  scaleBarFor,
  viewScale,
  viewScaleFromPxPerMeter,
} from './scale'

/** What MercatorCoordinate reports at a latitude; the caller's own input. */
const merc = (latDeg: number) =>
  MercatorCoordinate.fromLngLat({ lng: 0, lat: latDeg }).meterInMercatorCoordinateUnits()

describe('metresPerPixel', () => {
  it('lands on MapLibre own scale at zoom 0 on the equator', () => {
    /*
     * 78,184 m/px, which is 2*pi*6,371,008.8 / 512: MapLibre's mercator is
     * built on the MEAN radius. The number usually quoted for 512 px tiles is
     * 78,271, from the WGS84 equatorial radius, 0.11% away: invisible on
     * screen and fatal in an assertion, so the reference here is the one the
     * code actually stands on.
     */
    expect(metresPerPixel(0, merc(0))).toBeCloseTo(78184.0, 0)
  })

  it('halves with every zoom level', () => {
    const at = (z: number) => metresPerPixel(z, merc(0))
    for (const z of [0, 1, 5, 12]) expect(at(z) / at(z + 1)).toBeCloseTo(2, 9)
  })

  it('shrinks with latitude, because mercator stretches it', () => {
    // cos(60 deg) is a half, so the ground under a pixel is half as wide.
    expect(metresPerPixel(4, merc(60)) / metresPerPixel(4, merc(0))).toBeCloseTo(0.5, 2)
  })

  it('refuses to invent a number from a degenerate input', () => {
    expect(Number.isNaN(metresPerPixel(0, 0))).toBe(true)
    expect(Number.isNaN(metresPerPixel(Number.NaN, merc(0)))).toBe(true)
  })
})

describe('viewScale', () => {
  it('measures the whole viewport, not one pixel', () => {
    const scale = viewScale(0, merc(0), 512)
    // A full world across 512 px at zoom 0: one mean-radius circumference.
    const circumference = 2 * Math.PI * 6_371_008.8
    expect(scale.viewWidthM).toBeCloseTo(circumference, -2)
    expect(scale.viewWidthAu).toBeCloseTo(circumference / AU_M, 12)
  })

  it('reports a globe view as the tiny fraction of an au it is', () => {
    /* The point of carrying au here: it is the unit the solar scene is read in,
       and this says how far apart the two scenes are. */
    const scale = viewScale(1.5, merc(0), 1879)
    expect(scale.viewWidthAu).toBeLessThan(0.001)
    expect(scale.viewWidthAu).toBeGreaterThan(0)
  })
})

describe('formatting', () => {
  it('keeps three significant figures and switches unit where it has to', () => {
    expect(formatKm(27_673)).toBe('27.7 km')
    expect(formatKm(834)).toBe('834 m')
    expect(formatKm(52_000_000)).toBe(Math.round(52_000).toLocaleString() + ' km')
  })

  it('drops to exponent form where au stops being readable', () => {
    expect(formatAu(1.234)).toBe('1.23 au')
    expect(formatAu(0.000_35)).toBe('3.50e-4 au')
  })

  it('says so rather than printing NaN', () => {
    expect(formatKm(Number.NaN)).toBe('—')
    expect(formatAu(Number.NaN)).toBe('—')
  })
})

describe('mercatorZoomFromMetresPerPixel', () => {
  it('inverts metresPerPixel at the equator, so both scenes share a zoom number', () => {
    expect(mercatorZoomFromMetresPerPixel(metresPerPixel(0, merc(0)))).toBeCloseTo(0, 9)
    expect(mercatorZoomFromMetresPerPixel(metresPerPixel(1.5, merc(0)))).toBeCloseTo(1.5, 9)
    expect(mercatorZoomFromMetresPerPixel(metresPerPixel(-2, merc(0)))).toBeCloseTo(-2, 9)
  })

  it('agrees with MapLibre own meter-in-mercator at lat 0', () => {
    expect(equatorMeterInMercatorUnits()).toBeCloseTo(merc(0), 12)
  })
})

describe('pxPerMeterAtEquatorZoom', () => {
  it('is the reciprocal of metresPerPixel, including at the globe floor', () => {
    expect(pxPerMeterAtEquatorZoom(0)).toBeCloseTo(1 / metresPerPixel(0, merc(0)), 12)
    expect(pxPerMeterAtEquatorZoom(GLOBE_FLOOR_ZOOM)).toBeCloseTo(
      1 / metresPerPixel(GLOBE_FLOOR_ZOOM, merc(0)),
      12,
    )
  })
})

describe('viewScaleFromPxPerMeter', () => {
  it('is the reciprocal of the camera scale, across the canvas', () => {
    const pxPerM = 2e-9
    const scale = viewScaleFromPxPerMeter(pxPerM, 800)
    expect(scale.metresPerPixel).toBeCloseTo(1 / pxPerM, 12)
    expect(scale.viewWidthM).toBeCloseTo(800 / pxPerM, 3)
    expect(scale.viewWidthAu).toBeCloseTo(scale.viewWidthM / AU_M, 12)
  })
})

describe('scaleBarFor', () => {
  it('picks the largest 1-2-5 length that fits the budget', () => {
    // 1 km/px with 120 px of room: 100 km fits, 200 does not.
    expect(scaleBarFor(1000, 120)).toEqual({ metres: 100_000, widthPx: 100 })
    // 78 km/px (zoom 0): 5,000 km inside 120 px.
    const bar = scaleBarFor(78_184, 120)
    expect(bar?.metres).toBe(5_000_000)
    expect(bar!.widthPx).toBeGreaterThan(60)
    expect(bar!.widthPx).toBeLessThanOrEqual(120)
  })

  it('never draws wider than the budget, at any zoom', () => {
    for (let zoom = -2; zoom <= 20; zoom += 0.37) {
      const bar = scaleBarFor(78_184 / Math.pow(2, zoom), 120)
      expect(bar).not.toBeNull()
      expect(bar!.widthPx).toBeLessThanOrEqual(120)
      expect(bar!.widthPx).toBeGreaterThan(20)
    }
  })

  it('says nothing rather than drawing a lie', () => {
    expect(scaleBarFor(0, 120)).toBeNull()
    expect(scaleBarFor(Number.NaN, 120)).toBeNull()
  })
})
