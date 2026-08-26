/**
 * Main-thread propagation for the orbital view: the full-treatment tracks,
 * the solar scene's rings, and the small facts read off a satrec.
 *
 * Pure functions of (satrec, time) on purpose. The tool decides WHICH
 * satellites get a track and on what cadence; this module only knows how to
 * produce one, which is what lets the same sampler serve a lone ISS and the
 * satellite picked out of ten thousand without a second code path.
 */

import { eciSiToGeodetic, propagateEci, type Vec3 } from '@/lib/physics'
import type { SatRec } from 'satellite.js'
import type { GlobeTrackPoint } from '@/components/viz/globe/types'

/** Full-treatment track sampling: one point every 30 s, re-anchored on a 30 s bucket. */
export const TRACK_STEP_S = 30
export const TRACK_BUCKET_MS = 30_000
/** Used only if a TLE's mean motion is unusable; the real span comes from satrec.no. */
export const FALLBACK_TRACK_HALF_SPAN_S = 46 * 60
/**
 * Ceiling on one track's sample count, which is what makes the step ADAPTIVE.
 *
 * Thirty seconds per sample is right for LEO and ruinous for deep orbits: a
 * fifty-one-hour ellipse like SMILE's, drawn over three revolutions, would be
 * eighteen thousand SGP4 calls on the main thread every re-anchor bucket, a
 * visible stall, for detail far below what any zoom can show. The step
 * stretches instead, and the screen-space refiner puts detail back exactly
 * where the camera can see it, which is the division of labour those two were
 * built around.
 */
export const TRACK_MAX_SAMPLES = 2400

/** Ground track point for one satellite at an instant, or null if it will not propagate. */
export function trackPointAt(satrec: SatRec, date: Date, freezeEpoch?: Date): GlobeTrackPoint | null {
  const state = propagateEci(satrec, date)
  if (!state) return null
  const geo = eciSiToGeodetic(state.r, freezeEpoch ?? date)
  if (!geo) return null
  return { lon: geo.lonDeg, lat: geo.latDeg, altKm: geo.heightM / 1000, date }
}

/**
 * An Earth-fixed track of `revolutions` either side of `centerMs`.
 *
 * satrec.no is the mean motion in rad/min (satellite.js convention), so the
 * period comes from the TLE itself rather than from a hardcoded orbit class.
 * A sample that will not propagate is skipped, never guessed at.
 */
export function samplePeriodTrack(
  satrec: SatRec,
  centerMs: number,
  revolutions: number,
): GlobeTrackPoint[] {
  const periodMin = (2 * Math.PI) / satrec.no
  const halfSpanS =
    Number.isFinite(periodMin) && periodMin > 0
      ? periodMin * revolutions * 60
      : FALLBACK_TRACK_HALF_SPAN_S
  const stepS = Math.max(TRACK_STEP_S, (2 * halfSpanS) / TRACK_MAX_SAMPLES)
  const points: GlobeTrackPoint[] = []
  for (let dt = -halfSpanS; dt <= halfSpanS; dt += stepS) {
    const point = trackPointAt(satrec, new Date(centerMs + dt * 1000))
    if (point) points.push(point)
  }
  return points
}

/** Samples of one inertial ellipse, for the elevated globe trail. */
export const INERTIAL_TRACK_SAMPLES = 1440

const TAU = Math.PI * 2

function wrapPi(angle: number): number {
  let a = angle % TAU
  if (a > Math.PI) a -= TAU
  if (a < -Math.PI) a += TAU
  return a
}

/** Kepler: mean anomaly → true anomaly. Newton on the eccentric anomaly. */
export function keplerMeanToTrue(M: number, e: number): number {
  const m = wrapPi(M)
  let E = m
  for (let k = 0; k < 20; k++) {
    const dE = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < 1e-14) break
  }
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

/** Kepler: true anomaly → mean anomaly. */
export function keplerTrueToMean(nu: number, e: number): number {
  const n = wrapPi(nu)
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(n / 2), Math.sqrt(1 + e) * Math.cos(n / 2))
  return wrapPi(E - e * Math.sin(E))
}

/**
 * One inertial ellipse as geodetic points.
 *
 * Sample times are spaced in TRUE anomaly around `epochMs`, then each state
 * still comes from SGP4. Time-uniform sampling of a deep ellipse (MMS 4
 * e≈0.83) puts ~20° of perigee into one step; drawing those steps as chords
 * is the yellow fan through the Earth. Equal true-anomaly steps keep
 * consecutive radius vectors at a fixed angle, so the polyline follows the
 * ellipse.
 *
 * Greenwich conversion is `freezeMs` (default `epochMs`). Sample TIMES may
 * re-anchor on a short bucket; the conversion epoch must not. The swarm
 * latches one Earth orientation for the whole load, and the identified
 * satellite's trail has to use that same angle: a 30 s conversion bucket is
 * a different longitude, and hover then jumps the live point onto a trail
 * that is not the path the swarm had been flying.
 */
export function sampleInertialGeodeticTrack(
  satrec: SatRec,
  epochMs: number,
  revolutions: number,
  samples = INERTIAL_TRACK_SAMPLES,
  freezeMs = epochMs,
): GlobeTrackPoint[] {
  const n = satrec.no
  const e = satrec.ecco
  const M0 = satrec.mo
  if (!Number.isFinite(n) || n <= 0 || samples < 2 || !(e >= 0) || e >= 1) return []
  const tleEpochMs = (satrec.jdsatepoch - 2440587.5) * 86_400_000
  const Mnow = M0 + n * ((epochMs - tleEpochMs) / 60_000)
  const nuNow = keplerMeanToTrue(Mnow, e)
  const nuHalf = revolutions * TAU
  const freeze = new Date(freezeMs)
  const points: GlobeTrackPoint[] = []
  let prevM: number | null = null
  for (let i = 0; i < samples; i++) {
    const nu = nuNow - nuHalf + (2 * nuHalf * i) / (samples - 1)
    let M = keplerTrueToMean(nu, e)
    if (prevM == null) {
      M += TAU * Math.round((Mnow - nuHalf - M) / TAU)
    } else {
      M += TAU * Math.round((prevM - M) / TAU)
      if (M < prevM) M += TAU
    }
    prevM = M
    const at = new Date(tleEpochMs + ((M - M0) / n) * 60_000)
    const state = propagateEci(satrec, at)
    if (!state) continue
    const geo = eciSiToGeodetic(state.r, freeze)
    if (!geo) continue
    points.push({ lon: geo.lonDeg, lat: geo.latDeg, altKm: geo.heightM / 1000, date: at })
  }
  return points
}

/**
 * One revolution as ECI positions, for the solar scene's ring. Empty when the
 * mean motion is unusable: a ring with no period is not a ring.
 */
export function sampleEciRing(satrec: SatRec, centerMs: number, samples: number): Vec3[] {
  const periodMin = (2 * Math.PI) / satrec.no
  if (!Number.isFinite(periodMin) || periodMin <= 0) return []
  const periodS = periodMin * 60
  const ring: Vec3[] = []
  for (let i = 0; i <= samples; i++) {
    const sample = propagateEci(satrec, new Date(centerMs + (i / samples) * periodS * 1000))
    if (sample) ring.push([sample.r[0], sample.r[1], sample.r[2]])
  }
  return ring
}

/** One sidereal day in seconds: the rotation the ground track repeats against. */
export const SIDEREAL_DAY_S = 86164.0905

/**
 * Revolutions after which a ground track CLOSES on itself, or null when it
 * does not within the cap.
 *
 * A ground track closes when k orbital periods land on a whole number of
 * sidereal days: one revolution for a geosynchronous satellite, two for GPS
 * and Molniya, whose half-day orbits draw the classic closed figure-eight
 * over a full day. A track drawn shorter than its own cycle is visibly cut in
 * half, which is exactly how a GPS trajectory looked under the plain
 * count-based span.
 *
 * The cap is deliberately LOW. Resonance hunting with a big k would catch
 * near-misses like the ISS, whose 15.5 orbits a day nearly close after 31
 * revolutions, and thirty-one revolutions of a LEO track is a band wrapped
 * round the whole planet, not a trajectory. Four covers every deliberately
 * resonant orbit class flown (geo, semi-synchronous, Molniya, Tundra) and
 * nothing accidental.
 *
 * The tolerance is the longitude the endpoints may miss each other by. GPS
 * misses by hundredths of a degree; the ISS misses its best small-k case by
 * tens, which is the gap the threshold sits in.
 */
export function closedGroundTrackRevolutions(
  periodS: number,
  maxRevolutions = 4,
  toleranceDeg = 15,
): number | null {
  if (!Number.isFinite(periodS) || periodS <= 0) return null
  for (let k = 1; k <= maxRevolutions; k++) {
    const siderealDays = (k * periodS) / SIDEREAL_DAY_S
    const whole = Math.round(siderealDays)
    if (whole < 1) continue
    const missDeg = Math.abs(siderealDays - whole) * 360
    if (missDeg <= toleranceDeg) return k
  }
  return null
}

/**
 * Revolutions EACH SIDE a full-treatment track should span, given the count
 * rule's wish and the orbit's own resonance.
 *
 * For a resonant orbit the drawn figure only closes on multiples of its
 * cycle. Taking the mere maximum of wish and cycle was the ARKTIKA-M bug: a
 * lone Molniya got three revolutions against a two-revolution cycle, one
 * and a half figures, so the two ends stopped mid-air at different points
 * of the loop, which is the mid-air cut the closed-cycle rule exists to
 * remove. Rounding the wish UP to whole cycles lands both ends on geometry
 * that is already drawn, and the figure reads as closed to within the
 * orbit's own slow drift.
 */
export function trackSpanEachSide(periodS: number, wishEachSide: number): number {
  const closed = closedGroundTrackRevolutions(periodS)
  if (closed === null) return wishEachSide
  const wishTotal = wishEachSide * 2
  return (closed * Math.max(1, Math.ceil(wishTotal / closed))) / 2
}

/** Age of a satrec's element set in whole days, from its embedded epoch. */
export function tleAgeDays(satrec: SatRec, nowMs: number): number {
  const epochMs = (satrec.jdsatepoch - 2440587.5) * 86400000
  return Math.abs(nowMs - epochMs) / 86400000
}
