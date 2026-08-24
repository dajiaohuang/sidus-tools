/**
 * Pure sky geometry and the formatting of what it produces, for the orbital
 * view's tooltips and info rows. No React, no MapLibre: everything here is a
 * function of its arguments, which is what makes it testable without a canvas.
 */

import { eciSiToEcefSi } from '@/lib/physics'
import { sphereDirection } from '@/components/viz/globe/sun'

/**
 * World-frame unit direction of a geocentric equatorial-of-date vector.
 *
 * Same chain the Sun billboard uses: rotate by GMST into the Earth-fixed
 * frame, then read geocentric longitude and latitude. Deliberately NOT routed
 * through the geodetic helper, whose flattening correction would bend a
 * direction to a distant body by up to about 0.19 deg.
 */
export function worldDirectionOf(eciM: readonly number[], date: Date): [number, number, number] {
  const [x, y, z] = eciSiToEcefSi([eciM[0], eciM[1], eciM[2]], date)
  const lonDeg = (Math.atan2(y, x) * 180) / Math.PI
  const latDeg = (Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI
  return sphereDirection(lonDeg, latDeg)
}

/**
 * The same direction WITHOUT the sidereal rotation: longitude is right
 * ascension, and no instant is baked in.
 *
 * This is what a stored sky has to be. A direction produced by
 * `worldDirectionOf` carries GMST(date) inside it, so a sky cached on the
 * ephemeris tick teleports by a minute of Earth rotation, 0.25 degrees,
 * about seven pixels at the default view, every time the tick lands, and
 * stands still in between. Stored inertially, the cache never goes stale for
 * ROTATION at all: the drawing side spends the current sidereal angle through
 * `spinDirection` on every frame, and the sky sweeps instead of stepping.
 * Same split the satellite trails use, for the same reason.
 */
export function inertialDirectionOf(eciM: readonly number[]): [number, number, number] {
  const [x, y, z] = eciM
  const lonDeg = (Math.atan2(y, x) * 180) / Math.PI
  const latDeg = (Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI
  return sphereDirection(lonDeg, latDeg)
}

/**
 * A direction rotated about the globe's polar axis. `spinDirection(inertial,
 * -gmstRad(now))` is the Earth-fixed direction `worldDirectionOf` would give
 * for `now`, pinned by test, because the whole scheme is that one equality.
 */
export function spinDirection(
  direction: readonly [number, number, number],
  angleRad: number,
): [number, number, number] {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  /* The world frame puts the pole on +y and longitude in the x/z pair, so a
     spin about the pole leaves y alone. */
  return [direction[0] * c + direction[2] * s, direction[1], direction[2] * c - direction[0] * s]
}

/** Mean obliquity of the ecliptic at J2000, for the equatorial-to-ecliptic turn. */
export const OBLIQUITY_RAD = 23.439291 * (Math.PI / 180)

/** Geocentric ecliptic longitude and latitude of an equatorial vector, degrees. */
export function eclipticLonLatDeg(eci: readonly number[]): { lonDeg: number; latDeg: number } {
  const [x, y, z] = eci
  const yEcl = y * Math.cos(OBLIQUITY_RAD) + z * Math.sin(OBLIQUITY_RAD)
  const zEcl = -y * Math.sin(OBLIQUITY_RAD) + z * Math.cos(OBLIQUITY_RAD)
  return {
    lonDeg: (((Math.atan2(yEcl, x) * 180) / Math.PI) % 360 + 360) % 360,
    latDeg: (Math.asin(zEcl / Math.hypot(x, yEcl, zEcl)) * 180) / Math.PI,
  }
}

/** Degrees for a disk you can see, arcseconds for one you cannot. */
export function formatAngularDiameter(deg: number): string {
  return deg >= 0.05 ? `${deg.toFixed(3)}°` : `${(deg * 3600).toFixed(1)}″`
}

/**
 * Signed degrees, without the negative zero. The Sun's ecliptic latitude is
 * zero by definition, and rounding it to "-0.00" reads as a fault rather than
 * as the definition it is.
 */
export function formatSignedDeg(deg: number): string {
  const value = Math.abs(deg) < 0.005 ? 0 : deg
  return `${value > 0 ? '+' : value < 0 ? '' : ''}${value.toFixed(2)}`
}

/** Sun-body-Earth angle: 0 is full, pi is new. */
export function phaseAngleRad(bodyEci: readonly number[], sunEci: readonly number[]): number {
  const toSun = [sunEci[0] - bodyEci[0], sunEci[1] - bodyEci[1], sunEci[2] - bodyEci[2]]
  const toEarth = [-bodyEci[0], -bodyEci[1], -bodyEci[2]]
  const dot = toSun[0] * toEarth[0] + toSun[1] * toEarth[1] + toSun[2] * toEarth[2]
  const norm = Math.hypot(...toSun) * Math.hypot(...toEarth)
  return norm > 0 ? Math.acos(Math.max(-1, Math.min(1, dot / norm))) : 0
}
