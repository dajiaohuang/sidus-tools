// src/lib/physics/dawn-dusk.ts
/**
 * Dawn-dusk sun-synchronous orbit: beta angle from LTAN and date, eclipse
 * threshold beta* = asin(R/a), and the yearly eclipse season. Pure SI.
 *
 * beta = asin(cos d sin i sin(Omega - alpha_sun) + sin d cos i) (Vallado; Wikipedia
 * "Beta angle" in ecliptic form). For an SSO the node keeps a fixed local time,
 * so Omega - alpha_sun = (LTAN - 12 h) x 15 deg/h. Solar declination comes from
 * the vendored Vallado low-precision Sun (0.01 deg, 1950-2050). The equation of
 * time is ignored (LTAN referenced to the true Sun). Eclipse uses the cylindrical
 * shadow model already shipped in `eclipseWithBeta`.
 */
import { jday, sunPos } from '../vendor/satellite-js-pure'
import { EARTH_MU, EARTH_RADIUS } from './constants'
import { EARTH_J2 } from './j2'
import { eclipseWithBeta } from './power'
import { OMEGA_SUN, ssoInclination, ssoPeriod } from './sso'

const DEG = Math.PI / 180

/** Omega - alpha_sun [rad] for a local time of ascending node in hours [0, 24). */
export function ltanRaanOffsetRad(ltanHours: number): number | null {
  if (!Number.isFinite(ltanHours) || ltanHours < 0 || ltanHours >= 24) return null
  return (ltanHours - 12) * 15 * DEG
}

/** Solar beta angle [rad] from inclination, Omega - alpha_sun and solar declination. */
export function betaAngle(inclRad: number, raanMinusSunRaRad: number, sunDeclRad: number): number {
  const s =
    Math.cos(sunDeclRad) * Math.sin(inclRad) * Math.sin(raanMinusSunRaRad) +
    Math.sin(sunDeclRad) * Math.cos(inclRad)
  return Math.asin(Math.min(1, Math.max(-1, s)))
}

/** |beta| below which a circular orbit of semi-major axis a crosses the cylindrical shadow. */
export function eclipseThresholdBeta(a: number, bodyR = EARTH_RADIUS): number | null {
  if (!(bodyR > 0) || !(a > bodyR)) return null
  return Math.asin(bodyR / a)
}

/** Julian date of a UTC instant (Vallado algorithm via the vendored satellite.js). */
export function julianDay(date: Date): number {
  return jday(date)
}

export type DawnDuskOpts = {
  altitudeM: number
  ltanHours: number
  mu?: number
  R?: number
  j2?: number
  omegaSun?: number
}

export type DawnDuskBeta = {
  a: number
  inclRad: number
  periodS: number
  sunDeclRad: number
  raanMinusSunRaRad: number
  betaRad: number
  betaStarRad: number
  eclipseS: number
  eclipseFraction: number
}

export function dawnDuskBetaJd(opts: DawnDuskOpts & { jd: number }): DawnDuskBeta | null {
  const mu = opts.mu ?? EARTH_MU
  const R = opts.R ?? EARTH_RADIUS
  const j2 = opts.j2 ?? EARTH_J2
  const omegaSun = opts.omegaSun ?? OMEGA_SUN
  if (!(opts.altitudeM >= 0) || !Number.isFinite(opts.jd)) return null
  const dOmega = ltanRaanOffsetRad(opts.ltanHours)
  if (dOmega == null) return null
  const a = R + opts.altitudeM
  const inclRad = ssoInclination(a, mu, R, j2, omegaSun)
  const periodS = ssoPeriod(a, mu)
  const betaStarRad = eclipseThresholdBeta(a, R)
  if (inclRad == null || periodS == null || betaStarRad == null) return null
  const sunDeclRad = sunPos(opts.jd).decl
  const betaRad = betaAngle(inclRad, dOmega, sunDeclRad)
  const eclipseS = eclipseWithBeta(a, R, betaRad, periodS) ?? 0
  return {
    a,
    inclRad,
    periodS,
    sunDeclRad,
    raanMinusSunRaRad: dOmega,
    betaRad,
    betaStarRad,
    eclipseS,
    eclipseFraction: eclipseS / periodS,
  }
}

export function dawnDuskBeta(opts: DawnDuskOpts & { date: Date }): DawnDuskBeta | null {
  if (Number.isNaN(opts.date.getTime())) return null
  const { date, ...rest } = opts
  return dawnDuskBetaJd({ ...rest, jd: julianDay(date) })
}

export type DawnDuskSeason = {
  betaMinAbsRad: number
  betaMaxAbsRad: number
  eclipseDays: number
  firstEclipseDoy: number | null
  lastEclipseDoy: number | null
  maxEclipseS: number
  samples: { doy: number; betaRad: number; eclipseS: number }[]
}

/** One sample per day at 00:00 UTC, 365 days from January 1 of `year`. */
export function dawnDuskSeason(opts: DawnDuskOpts & { year: number }): DawnDuskSeason | null {
  if (!Number.isInteger(opts.year)) return null
  const { year, ...rest } = opts
  const samples: DawnDuskSeason['samples'] = []
  let betaMinAbsRad = Number.POSITIVE_INFINITY
  let betaMaxAbsRad = 0
  let eclipseDays = 0
  let firstEclipseDoy: number | null = null
  let lastEclipseDoy: number | null = null
  let maxEclipseS = 0
  for (let k = 0; k < 365; k++) {
    const doy = k + 1
    const b = dawnDuskBeta({ ...rest, date: new Date(Date.UTC(year, 0, doy)) })
    if (!b) return null
    const abs = Math.abs(b.betaRad)
    betaMinAbsRad = Math.min(betaMinAbsRad, abs)
    betaMaxAbsRad = Math.max(betaMaxAbsRad, abs)
    if (b.eclipseS > 0) {
      eclipseDays++
      firstEclipseDoy ??= doy
      lastEclipseDoy = doy
      maxEclipseS = Math.max(maxEclipseS, b.eclipseS)
    }
    samples.push({ doy, betaRad: b.betaRad, eclipseS: b.eclipseS })
  }
  return { betaMinAbsRad, betaMaxAbsRad, eclipseDays, firstEclipseDoy, lastEclipseDoy, maxEclipseS, samples }
}
