/**
 * Facts about one body in the solar scene, all computed from the shipped
 * physics at the displayed instant. Nothing here is a stored figure: the radius
 * comes from the body table, the orbit from the elements or from the body's own
 * state vector, the spin from the IAU prime-meridian rate, and the Moon's lit
 * fraction from its real phase angle. A number that cannot be derived is null,
 * and the caller leaves that row out.
 *
 * Frames: the planets' elements are already heliocentric ecliptic, so their
 * inclination is to the ecliptic by construction. The Moon's state arrives in
 * the equatorial frame and is rotated to the ecliptic before its elements are
 * taken, so its inclination means the same thing as the planets'.
 */

import {
  BODY_ROTATION,
  EARTH_MU,
  SUN_MU,
  earthHeliocentricEclipticSi,
  getBody,
  moonGeocentricEciSi,
  planetElementsAt,
  planetHeliocentricEclipticSi,
  rvToElements,
  sunEciSi,
  type BodyId,
  type PlanetId,
  type Vec3,
} from '@/lib/physics'
import { eclipticFromEquatorial } from './scene-math'

const DAY_S = 86_400

/** Step for the Moon's velocity, small against its period and large against float noise. */
const MOON_VELOCITY_STEP_S = 60

export type BodyFacts = {
  radiusM: number
  /** Which centre `distanceM` is measured from. */
  primary: 'sun' | 'earth' | null
  distanceM: number | null
  orbitalPeriodS: number | null
  /** Instantaneous orbital speed about the primary. */
  speedMs: number | null
  eccentricity: number | null
  /** Inclination to the ecliptic, radians. */
  inclinationRad: number | null
  rotationPeriodS: number | null
  /** Sunlit fraction of the disk as seen from Earth; only meaningful for the Moon. */
  litFraction: number | null
}

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/**
 * Sidereal rotation period from the IAU prime-meridian rate W'. A body with no
 * published rate (or a locked one) returns null rather than a divide by zero.
 */
export function rotationPeriodS(id: BodyId): number | null {
  const rateDegPerDay = BODY_ROTATION[id]?.pm[1]
  if (!rateDegPerDay) return null
  return (360 / Math.abs(rateDegPerDay)) * DAY_S
}

/** Period of a closed orbit from its semi-major axis. Null for an open one. */
export function orbitalPeriodS(semiMajorAxisM: number, mu: number): number | null {
  if (!(semiMajorAxisM > 0)) return null
  return 2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / mu)
}

/** Vis-viva speed at radius `rM` on an orbit of semi-major axis `aM`. */
export function visVivaSpeedMs(rM: number, aM: number, mu: number): number | null {
  if (!(rM > 0) || !(aM > 0)) return null
  const squared = mu * (2 / rM - 1 / aM)
  return squared > 0 ? Math.sqrt(squared) : null
}

/**
 * Sunlit fraction of a body's disk from its phase angle: the Sun-body-Earth
 * angle, zero at full and pi at new.
 */
export function litFractionFromPhase(phaseAngleRad: number): number {
  return (1 + Math.cos(phaseAngleRad)) / 2
}

/** Sun-body-Earth angle for a geocentric body, radians. */
export function phaseAngleRad(bodyGeocentric: Vec3, sunGeocentric: Vec3): number {
  const toSun = sub(sunGeocentric, bodyGeocentric)
  const toEarth: Vec3 = [-bodyGeocentric[0], -bodyGeocentric[1], -bodyGeocentric[2]]
  const denominator = norm(toSun) * norm(toEarth)
  if (!(denominator > 0)) return 0
  const dot = toSun[0] * toEarth[0] + toSun[1] * toEarth[1] + toSun[2] * toEarth[2]
  return Math.acos(Math.max(-1, Math.min(1, dot / denominator)))
}

export function bodyFactsAt(id: BodyId, date: Date): BodyFacts {
  const radiusM = getBody(id).radius
  const spin = rotationPeriodS(id)

  if (id === 'sun') {
    return {
      radiusM,
      primary: null,
      distanceM: null,
      orbitalPeriodS: null,
      speedMs: null,
      eccentricity: null,
      inclinationRad: null,
      rotationPeriodS: spin,
      litFraction: null,
    }
  }

  if (id === 'moon') {
    /* No element row for the Moon, so its orbit is read off its own state
       vector. The velocity is a central difference of the shipped series: the
       series has no analytic derivative to call, and a minute is short against
       a 27-day orbit yet long enough not to be float noise. */
    const at = (offsetS: number) =>
      eclipticFromEquatorial(moonGeocentricEciSi(new Date(date.getTime() + offsetS * 1000)))
    const position = at(0)
    const before = at(-MOON_VELOCITY_STEP_S)
    const after = at(MOON_VELOCITY_STEP_S)
    const velocity = sub(after, before).map((d) => d / (2 * MOON_VELOCITY_STEP_S)) as Vec3
    const elements = rvToElements(position, velocity, EARTH_MU)
    const sunGeocentric = eclipticFromEquatorial(sunEciSi(date))
    return {
      radiusM,
      primary: 'earth',
      distanceM: norm(position),
      orbitalPeriodS: elements ? orbitalPeriodS(elements.a, EARTH_MU) : null,
      speedMs: norm(velocity),
      eccentricity: elements?.e ?? null,
      inclinationRad: elements?.i ?? null,
      rotationPeriodS: spin,
      litFraction: litFractionFromPhase(phaseAngleRad(position, sunGeocentric)),
    }
  }

  const planet = id as PlanetId
  const elements = planetElementsAt(planet, date)
  const position =
    planet === 'earth' ? earthHeliocentricEclipticSi(date) : planetHeliocentricEclipticSi(planet, date)
  const distanceM = norm(position)
  return {
    radiusM,
    primary: 'sun',
    distanceM,
    orbitalPeriodS: orbitalPeriodS(elements.a_m, SUN_MU),
    speedMs: visVivaSpeedMs(distanceM, elements.a_m, SUN_MU),
    eccentricity: elements.e,
    inclinationRad: elements.i_rad,
    rotationPeriodS: spin,
    litFraction: null,
  }
}
