/**
 * Spherical two-body ground-track sampler (circular Kepler, no J2).
 * Earth rotation uses Vallado GMST at epoch plus the IERS sidereal rate
 * ω_E (same constant as groundTrackShiftPerOrbit). Not SGP4.
 */

import { EARTH_MU, EARTH_RADIUS } from './constants'
import { elementsToRv } from './elements'
import { EARTH_ROTATION_RATE } from './power'
import { gmstRad } from './sgp4'
import { vnorm } from './vector'

export type KeplerGroundTrackPoint = {
  lat: number
  lon: number
  t: number
}

export type KeplerGroundTrackOpts = {
  /** Circular altitude above the spherical radius (m). */
  altitudeM: number
  /** Inclination (rad). */
  inclinationRad: number
  /** Right ascension of the ascending node Ω (rad). */
  raanRad: number
  epoch: Date
  durationS: number
  samples: number
  mu?: number
  radiusM?: number
  argpRad?: number
  nu0Rad?: number
}

/** Wrap a longitude into (-180, 180] deg. */
export function wrapLongitudeDeg(lon: number): number {
  if (!Number.isFinite(lon)) return lon
  let x = ((((lon + 180) % 360) + 360) % 360) - 180
  if (x === -180) return 180
  return x
}

/** Shortest signed longitude change (deg, positive east). */
export function deltaLongitudeDeg(lon0: number, lon1: number): number {
  return wrapLongitudeDeg(lon1 - lon0)
}

/**
 * Sample a circular two-body ground track on a spherical Earth.
 * Inertial r from classical elements (e = 0); ECEF via R3(GMST).
 * Geocentric lat/lon, not WGS-84 geodetic.
 */
export function keplerGroundTrack(opts: KeplerGroundTrackOpts): KeplerGroundTrackPoint[] {
  const mu = opts.mu ?? EARTH_MU
  const radiusM = opts.radiusM ?? EARTH_RADIUS
  const a = radiusM + opts.altitudeM
  const nSamp = Math.max(2, Math.floor(opts.samples))
  if (!(opts.altitudeM >= 0) || !(mu > 0) || !(a > 0) || !(opts.durationS > 0)) return []

  const meanMotion = Math.sqrt(mu / (a * a * a))
  if (!Number.isFinite(meanMotion) || !(meanMotion > 0)) return []

  const argp = opts.argpRad ?? 0
  const nu0 = opts.nu0Rad ?? 0
  const gmst0 = gmstRad(opts.epoch)
  const out: KeplerGroundTrackPoint[] = []

  for (let k = 0; k < nSamp; k++) {
    const t = (opts.durationS * k) / (nSamp - 1)
    const nu = nu0 + meanMotion * t
    const st = elementsToRv(
      {
        a,
        e: 0,
        i: opts.inclinationRad,
        raan: opts.raanRad,
        argp,
        nu,
      },
      mu,
    )
    if (!st) continue
    const gmst = gmst0 + EARTH_ROTATION_RATE * t
    const c = Math.cos(gmst)
    const s = Math.sin(gmst)
    const [x, y, z] = st.r
    const xe = x * c + y * s
    const ye = -x * s + y * c
    const r = vnorm([xe, ye, z])
    if (!(r > 0)) continue
    const lat = (Math.asin(Math.min(1, Math.max(-1, z / r))) * 180) / Math.PI
    const lon = wrapLongitudeDeg((Math.atan2(ye, xe) * 180) / Math.PI)
    out.push({ lat, lon, t })
  }
  return out
}
