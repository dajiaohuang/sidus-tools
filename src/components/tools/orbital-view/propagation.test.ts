import { describe, expect, it } from 'vitest'
import { parseTle, SAMPLE_ISS_TLE } from '@/lib/physics'
import {
  closedGroundTrackRevolutions,
  samplePeriodTrack,
  trackSpanEachSide,
  SIDEREAL_DAY_S,
  TRACK_MAX_SAMPLES,
  TRACK_STEP_S,
} from './propagation'

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
