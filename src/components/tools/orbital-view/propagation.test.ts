import { describe, expect, it } from 'vitest'
import { parseTle, SAMPLE_ISS_TLE } from '@/lib/physics'
import { ecefMetersOf } from '@/components/viz/globe/track'
import type { GlobeTrackPoint } from '@/components/viz/globe/types'
import {
  closedGroundTrackRevolutions,
  keplerMeanToTrue,
  keplerTrueToMean,
  sampleInertialGeodeticTrack,
  samplePeriodTrack,
  trackPointAt,
  trackSpanEachSide,
  SIDEREAL_DAY_S,
  TRACK_MAX_SAMPLES,
  TRACK_STEP_S,
} from './propagation'

function minMetersToTrack(point: GlobeTrackPoint, track: readonly GlobeTrackPoint[]): number {
  const p = ecefMetersOf(point)
  let min = Infinity
  for (let i = 0; i < track.length - 1; i++) {
    const a = ecefMetersOf(track[i])
    const b = ecefMetersOf(track[i + 1])
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const
    const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
    const t = ab2 > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / ab2)) : 0
    min = Math.min(
      min,
      Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]),
    )
  }
  return min
}

describe('closedGroundTrackRevolutions', () => {
  it('closes a geosynchronous track in one revolution', () => {
    expect(closedGroundTrackRevolutions(SIDEREAL_DAY_S)).toBe(1)
  })

  it('closes GPS and Molniya in two: the classic day-long figure-eight', () => {
    // Semi-synchronous: half a sidereal day per orbit, to within seconds.
    expect(closedGroundTrackRevolutions(SIDEREAL_DAY_S / 2)).toBe(2)
    expect(closedGroundTrackRevolutions(43_078)).toBe(2) // GPS block III, ~717.97 min
    expect(closedGroundTrackRevolutions(43_100)).toBe(2) // Molniya-class
  })

  it('refuses the ISS, whose near-resonance needs thirty-one revolutions', () => {
    /*
     * 15.5 orbits a day ALMOST closes after 31 revolutions, and a rule that
     * hunted resonance that far would wrap a LEO track round the whole planet.
     * The low cap is the point, so it is pinned.
     */
    expect(closedGroundTrackRevolutions(5_574)).toBeNull()
  })

  it('refuses a deep ellipse that lands on no whole day', () => {
    // SMILE-class: about fifty-one hours, 2.13 sidereal days per revolution.
    expect(closedGroundTrackRevolutions(51 * 3600)).toBeNull()
  })

  it('refuses garbage rather than resonating with it', () => {
    expect(closedGroundTrackRevolutions(0)).toBeNull()
    expect(closedGroundTrackRevolutions(-100)).toBeNull()
    expect(closedGroundTrackRevolutions(Number.NaN)).toBeNull()
  })
})

describe('samplePeriodTrack', () => {
  const iss = (() => {
    const parsed = parseTle(SAMPLE_ISS_TLE)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.satrec
  })()

  it('keeps the thirty-second step for LEO, where it is affordable and needed', () => {
    const points = samplePeriodTrack(iss, Date.parse('2025-08-24T12:00:00Z'), 1.5)
    // Three revolutions of a ~93-minute orbit at 30 s: several hundred points.
    expect(points.length).toBeGreaterThan(400)
    const stepS = (points[1].date.getTime() - points[0].date.getTime()) / 1000
    expect(stepS).toBeCloseTo(TRACK_STEP_S, 3)
  })

  it('never exceeds the sample budget, whatever the period', () => {
    /*
     * The budget IS the protection: a fifty-one-hour ellipse over three
     * revolutions at a fixed 30 s step would be eighteen thousand SGP4 calls
     * per re-anchor bucket, a visible main-thread stall spent on detail no
     * zoom can show. The satrec is still the ISS, but the budget must hold for
     * ANY span asked of it, which is what an absurd revolution count probes.
     */
    const points = samplePeriodTrack(iss, Date.parse('2025-08-24T12:00:00Z'), 100)
    expect(points.length).toBeLessThanOrEqual(TRACK_MAX_SAMPLES + 2)
  })
})

describe('kepler anomaly conversion', () => {
  it('round-trips true ↔ mean anomaly for a deep ellipse', () => {
    const e = 0.8277253
    for (const nu of [-2.8, -1, 0, 0.4, 1.2, 2.7]) {
      const M = keplerTrueToMean(nu, e)
      expect(keplerMeanToTrue(M, e)).toBeCloseTo(nu, 8)
    }
  })
})

describe('sampleInertialGeodeticTrack', () => {
  const iss = (() => {
    const parsed = parseTle(SAMPLE_ISS_TLE)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.satrec
  })()

  const mms4 = (() => {
    const parsed = parseTle(`MMS 4
1 40485U 15011D   26237.33335648 -.00002169  00000+0  00000+0 0  9991
2 40485  72.8539 347.9535 8277253 168.8824 152.2305  0.28350491  1386`)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.satrec
  })()

  it('closes after one inertial revolution, unlike an Earth-fixed triple pass', () => {
    const epoch = Date.parse('2025-08-24T12:00:00Z')
    const ring = sampleInertialGeodeticTrack(iss, epoch, 0.5)
    expect(ring.length).toBeGreaterThan(20)
    const a = ring[0]
    const b = ring[ring.length - 1]
    const dLon = Math.min(Math.abs(a.lon - b.lon), 360 - Math.abs(a.lon - b.lon))
    expect(Math.hypot(a.lat - b.lat, dLon)).toBeLessThan(2)
    expect(Math.abs(a.altKm - b.altKm)).toBeLessThan(20)
  })

  it('keeps consecutive radius vectors at a nearly equal angle on MMS 4', () => {
    const epoch = Date.UTC(2026, 7, 25, 12)
    const ring = sampleInertialGeodeticTrack(mms4, epoch, 0.5)
    expect(ring.length).toBeGreaterThan(100)
    const angles: number[] = []
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ecefMetersOf(ring[i])
      const B = ecefMetersOf(ring[i + 1])
      const nA = Math.hypot(...A)
      const nB = Math.hypot(...B)
      const cos = (A[0] * B[0] + A[1] * B[1] + A[2] * B[2]) / (nA * nB)
      angles.push(Math.acos(Math.min(1, Math.max(-1, cos))))
    }
    const min = Math.min(...angles)
    const max = Math.max(...angles)
    expect(min).toBeGreaterThan(0.002)
    expect(max / min).toBeLessThan(1.5)
    expect(max).toBeLessThan(0.04)
  })

  it('reaches MMS 4 perigee instead of cutting it with a chord', () => {
    const epoch = Date.UTC(2026, 7, 25, 12)
    const ring = sampleInertialGeodeticTrack(mms4, epoch, 0.5)
    const minAlt = Math.min(...ring.map((p) => p.altKm))
    expect(minAlt).toBeLessThan(15_000)
    expect(minAlt).toBeGreaterThan(2_000)
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ecefMetersOf(ring[i])
      const B = ecefMetersOf(ring[i + 1])
      const midR = Math.hypot((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2)
      expect(midR).toBeGreaterThan(6_371_008)
    }
  })

  it('puts the freeze-epoch live point on the inertial ellipse', () => {
    const epoch = Date.parse('2026-08-24T12:00:00Z')
    const ring = sampleInertialGeodeticTrack(iss, epoch, 0.5)
    const here = trackPointAt(iss, new Date(epoch), new Date(epoch))
    expect(here).toBeTruthy()
    expect(minMetersToTrack(here!, ring)).toBeLessThan(500)
  })

  it('keeps a later live point on the same frozen ellipse', () => {
    const epoch = Date.parse('2026-08-24T12:00:00Z')
    const ring = sampleInertialGeodeticTrack(iss, epoch, 0.5)
    const later = trackPointAt(iss, new Date(epoch + 15_000), new Date(epoch))
    expect(later).toBeTruthy()
    expect(minMetersToTrack(later!, ring)).toBeLessThan(500)
  })

  it('keeps the live point on the ellipse when Greenwich freeze is older than the sample centre', () => {
    /* Hover: swarm latched freeze at load, track samples re-anchor every 30 s. */
    const freeze = Date.parse('2026-08-24T12:00:00Z')
    const centre = freeze + 30_000
    const ring = sampleInertialGeodeticTrack(iss, centre, 0.5, undefined, freeze)
    const here = trackPointAt(iss, new Date(centre), new Date(freeze))
    expect(here).toBeTruthy()
    expect(minMetersToTrack(here!, ring)).toBeLessThan(500)
  })

  it('walks the live point off the ellipse when Greenwich freeze is a later 30 s bucket', () => {
    const freeze = Date.parse('2026-08-24T12:00:00Z')
    const centre = freeze + 30_000
    const ring = sampleInertialGeodeticTrack(iss, centre, 0.5, undefined, centre)
    const swarmPoint = trackPointAt(iss, new Date(centre), new Date(freeze))
    expect(swarmPoint).toBeTruthy()
    expect(minMetersToTrack(swarmPoint!, ring)).toBeGreaterThan(5_000)
  })
})

describe('trackSpanEachSide', () => {
  it('leaves a non-resonant orbit on the count rule', () => {
    expect(trackSpanEachSide(5_574, 1.5)).toBe(1.5) // ISS
    expect(trackSpanEachSide(51 * 3600, 1.5)).toBe(1.5) // SMILE-class deep ellipse
  })

  it('rounds a Molniya lone-satellite wish up to two whole figures', () => {
    /*
     * The ARKTIKA-M cut. Wish: 1.5 revolutions each side, three total; the
     * figure closes every two. Three revolutions is a figure and a half, so
     * both ends stopped mid-air at different points of the loop. Four is two
     * whole figures and every end lands on geometry already drawn.
     */
    expect(trackSpanEachSide(SIDEREAL_DAY_S / 2, 1.5)).toBe(2)
  })

  it('keeps the crowd-identified span at exactly one figure', () => {
    // Wish one revolution total, cycle two: one whole figure, no more.
    expect(trackSpanEachSide(SIDEREAL_DAY_S / 2, 0.5)).toBe(1)
  })

  it('lets a geosynchronous loop keep the triple pass, which already closes', () => {
    // Every revolution is a whole figure, so the wish is already on the grid.
    expect(trackSpanEachSide(SIDEREAL_DAY_S, 1.5)).toBe(1.5)
  })

  it('never spans less than one whole figure', () => {
    expect(trackSpanEachSide(SIDEREAL_DAY_S, 0.1)).toBe(0.5)
  })
})
