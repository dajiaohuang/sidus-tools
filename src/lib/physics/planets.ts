/**
 * Solar-system ephemeris: low-precision planetary and lunar positions.
 *
 * ## API contract
 *
 * Every output is SI: metres for positions, radians for angles. Two frames
 * are in play and they are not interchangeable:
 *
 * - `planetHeliocentricEclipticSi` returns Sun-centred **J2000 ecliptic**
 *   metres. This is the frame the orrery scene consumes.
 * - `planetHeliocentricEquatorialSi` returns the same state rotated into the
 *   **J2000 equatorial (ICRF-aligned)** frame by the fixed J2000 obliquity.
 * - `moonGeocentricEciSi` returns Earth-centred **J2000 equatorial** metres.
 *   The underlying series is mean-equator-of-date, the same convention
 *   `sunEciSi` (in `./sgp4`) uses; this module rotates it to J2000 rather than
 *   leaving the caller to absorb the difference, which reaches 0.4 deg three
 *   decades out. `sunEciSi` is untouched.
 * - `bodyOrientation` returns ICRF pole right ascension, declination and
 *   prime-meridian angle in radians.
 *
 * ## Planets
 *
 * Implements the JPL/Standish "Approximate Positions of the Planets"
 * algorithm with the Table 1 element set, valid **1800 AD to 2050 AD only**.
 * Table 2a/2b (3000 BC to 3000 AD) is deliberately not implemented: inside
 * 1800-2050 it is the worse fit of the two.
 *
 * Earth is represented by the table's **Earth/Moon barycentre** row, which is
 * the only Earth-like row Standish publishes. Earth's centre orbits that
 * barycentre at roughly 4671 km, so `planetHeliocentricEclipticSi('earth', d)`
 * is offset from Earth's true centre by up to about that much. For an orrery
 * at solar-system scale the offset is invisible; do not use it for anything
 * geocentric.
 *
 * Source: <https://ssd.jpl.nasa.gov/planets/approx_pos.html>, the web
 * reformatting of the 1992 article by E.M. Standish and J.G. Williams.
 * Retrieved 2026-08-20, vendored verbatim with its SHA-256 under
 * `golden/data/`. Every constant below is transcribed from that page and is
 * re-verified against the vendored copy by `planets.test.ts`.
 *
 * ## Moon
 *
 * Implements Vallado's Algorithm 31 (low-precision geocentric lunar
 * ephemeris), transcribed from `matlab/moon.m` in Vallado's published
 * companion software, which cites "vallado 2007, 290, alg 31, ex 5-3".
 * Source archive <https://celestrak.org/software/vallado/matlab.zip>,
 * retrieved 2026-08-20, SHA-256 recorded in `golden/data/README.md`.
 *
 * ## Rotational elements
 *
 * Pole and prime-meridian values come from NAIF generic kernel
 * `pck00011.tpc` (SHA-256 `3dff7b1d...28bb1`, fetched 2026-08-20, vendored
 * under `golden/data/`), which encodes Archinal et al., "Report of the IAU
 * Working Group on Cartographic Coordinates and Rotational Elements: 2015",
 * Celestial Mechanics and Dynamical Astronomy. Earth and Moon carry 2009
 * values because, as that kernel states, the 2015 report does not provide
 * orientation data for either body.
 *
 * Polynomial terms are implemented in full. Periodic (nutation-precession)
 * terms are implemented for the Moon only. See `bodyOrientation` for exactly
 * what that leaves out and how large it is.
 *
 * ## Time
 *
 * The algorithms are defined on Julian centuries of TDB (planets) and TDB
 * (Moon) past J2000. `Date` carries UTC, and this module treats UTC as TDB
 * directly. The two differ by about 70 s this century, which moves Mercury,
 * the fastest body here, by roughly 3 km. That is three orders of magnitude
 * below Mercury's own published model error, so the shortcut is free at this
 * precision class.
 *
 * Educational models. Not flight software.
 */

import { getBody } from './bodies'
import { AU, EARTH_RADIUS } from './constants'
import { vnorm, type Vec3 } from './vector'

const DEG = Math.PI / 180
const ARCSEC = DEG / 3600

/** The published accuracy table quotes distance errors in thousands of km. */
const THOUSAND_KM = 1e6

/** Julian date of the Unix epoch, 1970-01-01T00:00:00Z. */
const JD_UNIX_EPOCH = 2440587.5

/** Julian date of J2000.0, 2000-01-01T12:00:00 TT. */
const JD_J2000 = 2451545.0

const DAYS_PER_JULIAN_CENTURY = 36525

/** Mean obliquity of the ecliptic at J2000, per the Standish page. */
export const J2000_OBLIQUITY_RAD = 23.43928 * DEG

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

/** Table order, Sun outward. */
export const PLANET_IDS: readonly PlanetId[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]

/** Keplerian elements propagated to an epoch. SI. */
export type PlanetElements = {
  /** Semi-major axis (m) */
  a_m: number
  /** Eccentricity */
  e: number
  /** Inclination (rad) */
  i_rad: number
  /** Longitude of the ascending node Ω (rad) */
  raan_rad: number
  /** Argument of perihelion ω (rad) */
  argp_rad: number
  /** Mean anomaly M (rad), wrapped to [-π, +π] as the algorithm requires */
  M_rad: number
}

/**
 * One row of Standish Table 1: element values at J2000 and their rates per
 * Julian century. Units are au and degrees, exactly as published, so the
 * numbers stay diffable against the vendored source.
 */
type ElementRow = {
  /** Semi-major axis (au), rate (au/Cy) */
  a: readonly [number, number]
  /** Eccentricity, rate (1/Cy) */
  e: readonly [number, number]
  /** Inclination (deg), rate (deg/Cy) */
  i: readonly [number, number]
  /** Mean longitude L (deg), rate (deg/Cy) */
  L: readonly [number, number]
  /** Longitude of perihelion ϖ (deg), rate (deg/Cy) */
  lonPeri: readonly [number, number]
  /** Longitude of the ascending node Ω (deg), rate (deg/Cy) */
  lonNode: readonly [number, number]
}

/**
 * Standish Table 1, "Keplerian elements and their rates, with respect to the
 * mean ecliptic and equinox of J2000, valid for the time-interval
 * 1800 AD - 2050 AD". Transcribed verbatim; `earth` is the published
 * "EM Bary" row.
 *
 * The published column header labels the eccentricity units "rad, rad/Cy".
 * Eccentricity is dimensionless; that label is an error in the source and
 * changes nothing about the values.
 */
export const PLANET_ELEMENTS_J2000: Readonly<Record<PlanetId, ElementRow>> = {
  mercury: {
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    i: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    lonPeri: [77.45779628, 0.16047689],
    lonNode: [48.33076593, -0.12534081],
  },
  venus: {
    a: [0.72333566, 0.0000039],
    e: [0.00677672, -0.00004107],
    i: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    lonPeri: [131.60246718, 0.00268329],
    lonNode: [76.67984255, -0.27769418],
  },
  earth: {
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    i: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    lonPeri: [102.93768193, 0.32327364],
    lonNode: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    i: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    lonPeri: [-23.94362959, 0.44441088],
    lonNode: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    i: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    lonPeri: [14.72847983, 0.21252668],
    lonNode: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    i: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    lonPeri: [92.59887831, -0.41897216],
    lonNode: [113.66242448, -0.28867794],
  },
  uranus: {
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    i: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    lonPeri: [170.9542763, 0.40805281],
    lonNode: [74.01692503, 0.04240589],
  },
  neptune: {
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    i: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    lonPeri: [44.96476227, -0.32241464],
    lonNode: [131.78422574, -0.00508664],
  },
}

/** Published nominal error of the Table 1 fit for one body. */
export type PlanetNominalError = {
  /** Heliocentric longitude λ (rad) */
  lon_rad: number
  /** Heliocentric latitude φ (rad) */
  lat_rad: number
  /** Heliocentric distance ρ (m) */
  range_m: number
}

/**
 * "Nominal errors in heliocentric longitude, λ, latitude, φ, and distance,
 * ρ" for 1800 AD to 2050 AD, transcribed from the accuracy table on the
 * Standish page (arcsec, arcsec, and thousands of km there).
 *
 * These are nominal, not maximum, errors. Measured against JPL Horizons over
 * 101 epochs spanning the validity window, the RMS error of this
 * implementation lands at or under every figure below for seven of the eight
 * bodies, with per-epoch peaks running two to three times the RMS. Neptune is
 * the exception; see `golden/data/README.md`.
 */
export const PLANET_NOMINAL_ERROR: Readonly<Record<PlanetId, PlanetNominalError>> = {
  mercury: { lon_rad: 15 * ARCSEC, lat_rad: 1 * ARCSEC, range_m: 1 * THOUSAND_KM },
  venus: { lon_rad: 20 * ARCSEC, lat_rad: 1 * ARCSEC, range_m: 4 * THOUSAND_KM },
  earth: { lon_rad: 20 * ARCSEC, lat_rad: 8 * ARCSEC, range_m: 6 * THOUSAND_KM },
  mars: { lon_rad: 40 * ARCSEC, lat_rad: 2 * ARCSEC, range_m: 25 * THOUSAND_KM },
  jupiter: { lon_rad: 400 * ARCSEC, lat_rad: 10 * ARCSEC, range_m: 600 * THOUSAND_KM },
  saturn: { lon_rad: 600 * ARCSEC, lat_rad: 25 * ARCSEC, range_m: 1500 * THOUSAND_KM },
  uranus: { lon_rad: 50 * ARCSEC, lat_rad: 2 * ARCSEC, range_m: 1000 * THOUSAND_KM },
  neptune: { lon_rad: 10 * ARCSEC, lat_rad: 1 * ARCSEC, range_m: 200 * THOUSAND_KM },
}

/** Julian date from a `Date`. UTC is used directly as the TDB argument. */
export function julianDate(date: Date): number {
  return date.getTime() / 86_400_000 + JD_UNIX_EPOCH
}

/** Julian centuries past J2000. */
function centuriesSinceJ2000(date: Date): number {
  return (julianDate(date) - JD_J2000) / DAYS_PER_JULIAN_CENTURY
}

/** Wrap degrees to the [-180, +180] range the algorithm's Kepler solve needs. */
function wrapDegPm180(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180
}

/**
 * Kepler's equation in the degree form the source specifies,
 * `M = E - e* sin E` with `e* = (180/π) e`, solved by the published
 * Newton iteration from the published starting guess.
 *
 * @param mDeg Mean anomaly (deg), already wrapped to [-180, +180]
 * @param e Eccentricity
 * @returns Eccentric anomaly (deg)
 */
function solveKeplerDeg(mDeg: number, e: number): number {
  const eStar = (180 / Math.PI) * e
  let E = mDeg + eStar * Math.sin(mDeg * DEG)
  // The source states tol = 1e-6 deg is sufficient for this element set.
  for (let iter = 0; iter < 100; iter++) {
    const dM = mDeg - (E - eStar * Math.sin(E * DEG))
    const dE = dM / (1 - e * Math.cos(E * DEG))
    E += dE
    if (Math.abs(dE) <= 1e-6) break
  }
  return E
}

/**
 * Keplerian elements of a planet at `date`, propagated from Table 1 by the
 * published centennial rates. Intended for drawing orbit paths: sweep
 * `M_rad` over a full turn and feed each value to
 * `planetPositionFromElementsSi`.
 */
export function planetElementsAt(planet: PlanetId, date: Date): PlanetElements {
  const row = PLANET_ELEMENTS_J2000[planet]
  const T = centuriesSinceJ2000(date)

  const aAu = row.a[0] + row.a[1] * T
  const e = row.e[0] + row.e[1] * T
  const iDeg = row.i[0] + row.i[1] * T
  const lDeg = row.L[0] + row.L[1] * T
  const lonPeriDeg = row.lonPeri[0] + row.lonPeri[1] * T
  const lonNodeDeg = row.lonNode[0] + row.lonNode[1] * T

  const argpDeg = lonPeriDeg - lonNodeDeg
  const mDeg = wrapDegPm180(lDeg - lonPeriDeg)

  return {
    a_m: aAu * AU,
    e,
    i_rad: iDeg * DEG,
    raan_rad: lonNodeDeg * DEG,
    argp_rad: argpDeg * DEG,
    M_rad: mDeg * DEG,
  }
}

/**
 * Heliocentric J2000 ecliptic position (m) from Keplerian elements at an
 * arbitrary mean anomaly, using the source's orbital-plane coordinates and
 * its explicit Rz(-Ω) Rx(-I) Rz(-ω) rotation.
 */
export function planetPositionFromElementsSi(
  elements: PlanetElements,
  meanAnomalyRad: number,
): Vec3 {
  const { a_m: a, e, i_rad: i, raan_rad: raan, argp_rad: argp } = elements
  const eDeg = solveKeplerDeg(wrapDegPm180(meanAnomalyRad / DEG), e)
  const E = eDeg * DEG

  const xOrb = a * (Math.cos(E) - e)
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E)

  const cw = Math.cos(argp)
  const sw = Math.sin(argp)
  const co = Math.cos(raan)
  const so = Math.sin(raan)
  const ci = Math.cos(i)
  const si = Math.sin(i)

  return [
    (cw * co - sw * so * ci) * xOrb + (-sw * co - cw * so * ci) * yOrb,
    (cw * so + sw * co * ci) * xOrb + (-sw * so + cw * co * ci) * yOrb,
    sw * si * xOrb + cw * si * yOrb,
  ]
}

/** Heliocentric J2000 ecliptic position (m) of a planet at `date`. */
export function planetHeliocentricEclipticSi(planet: PlanetId, date: Date): Vec3 {
  const elements = planetElementsAt(planet, date)
  return planetPositionFromElementsSi(elements, elements.M_rad)
}

/**
 * Heliocentric J2000 equatorial position (m), the source's optional "ICRF or
 * J2000 frame" output: a rotation of the ecliptic vector about the x-axis by
 * the fixed J2000 obliquity.
 */
export function planetHeliocentricEquatorialSi(planet: PlanetId, date: Date): Vec3 {
  const [x, y, z] = planetHeliocentricEclipticSi(planet, date)
  const ce = Math.cos(J2000_OBLIQUITY_RAD)
  const se = Math.sin(J2000_OBLIQUITY_RAD)
  return [x, ce * y - se * z, se * y + ce * z]
}

/**
 * Rotate a mean-equator-and-equinox-of-date vector to J2000, using the
 * IAU 1976 precession angles (Lieske et al. 1977) as given in the standard
 * formulation, with T in Julian centuries past J2000:
 *
 * ```
 * zeta  = 2306.2181"T + 0.30188"T^2 + 0.017998"T^3
 * theta = 2004.3109"T - 0.42665"T^2 - 0.041833"T^3
 * z     = 2306.2181"T + 1.09468"T^2 + 0.018203"T^3
 * ```
 *
 * The composed rotation is Rz(-z) Ry(theta) Rz(-zeta), applied here in the
 * of-date to J2000 direction.
 */
function precessOfDateToJ2000(v: Vec3, T: number): Vec3 {
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC

  const cz = Math.cos(-zeta)
  const sz = Math.sin(-zeta)
  const a: Vec3 = [cz * v[0] - sz * v[1], sz * v[0] + cz * v[1], v[2]]

  const ct = Math.cos(theta)
  const st = Math.sin(theta)
  const b: Vec3 = [ct * a[0] + st * a[2], a[1], -st * a[0] + ct * a[2]]

  const cZ = Math.cos(-z)
  const sZ = Math.sin(-z)
  return [cZ * b[0] - sZ * b[1], sZ * b[0] + cZ * b[1], b[2]]
}

/**
 * Inverse of `precessOfDateToJ2000`: rotate a J2000 equatorial vector to the
 * mean equator and equinox of date. The composed rotation is orthogonal, so
 * the inverse is the transpose, applied here by reversing the three steps and
 * negating each angle.
 */
function precessJ2000ToOfDate(v: Vec3, T: number): Vec3 {
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC

  const cZ = Math.cos(z)
  const sZ = Math.sin(z)
  const a: Vec3 = [cZ * v[0] - sZ * v[1], sZ * v[0] + cZ * v[1], v[2]]

  const ct = Math.cos(-theta)
  const st = Math.sin(-theta)
  const b: Vec3 = [ct * a[0] + st * a[2], a[1], -st * a[0] + ct * a[2]]

  const cz = Math.cos(zeta)
  const sz = Math.sin(zeta)
  return [cz * b[0] - sz * b[1], sz * b[0] + cz * b[1], b[2]]
}

/**
 * Vallado's Algorithm 31 exactly as published: geocentric equatorial position
 * of the Moon (m) in the **mean equator and equinox of date**, the same frame
 * convention `sunEciSi` uses.
 *
 * Prefer `moonGeocentricEciSi` unless you specifically need to stay in the
 * of-date frame to match a legacy consumer. Exposed separately so the
 * transcription can be audited against the vendored `moon.m` with no rotation
 * in between.
 *
 * Vallado's own constants file uses an Earth radius of 6378.1363 km where
 * this codebase uses 6378.137 km. The 0.7 m difference scales to about 40 m
 * at lunar distance.
 */
export function moonGeocentricMeanOfDateSi(date: Date): Vec3 {
  const T = centuriesSinceJ2000(date)
  const TWO_PI = 2 * Math.PI

  const eclLonDeg =
    218.32 +
    481267.8813 * T +
    6.29 * Math.sin((134.9 + 477198.85 * T) * DEG) -
    1.27 * Math.sin((259.2 - 413335.38 * T) * DEG) +
    0.66 * Math.sin((235.7 + 890534.23 * T) * DEG) +
    0.21 * Math.sin((269.9 + 954397.7 * T) * DEG) -
    0.19 * Math.sin((357.5 + 35999.05 * T) * DEG) -
    0.11 * Math.sin((186.6 + 966404.05 * T) * DEG)

  const eclLatDeg =
    5.13 * Math.sin((93.3 + 483202.03 * T) * DEG) +
    0.28 * Math.sin((228.2 + 960400.87 * T) * DEG) -
    0.28 * Math.sin((318.3 + 6003.18 * T) * DEG) -
    0.17 * Math.sin((217.6 - 407332.2 * T) * DEG)

  const parallaxDeg =
    0.9508 +
    0.0518 * Math.cos((134.9 + 477198.85 * T) * DEG) +
    0.0095 * Math.cos((259.2 - 413335.38 * T) * DEG) +
    0.0078 * Math.cos((235.7 + 890534.23 * T) * DEG) +
    0.0028 * Math.cos((269.9 + 954397.7 * T) * DEG)

  const eclLon = (eclLonDeg * DEG) % TWO_PI
  const eclLat = (eclLatDeg * DEG) % TWO_PI
  const parallax = (parallaxDeg * DEG) % TWO_PI

  const obliquity = (23.439291 - 0.0130042 * T) * DEG
  const cosLat = Math.cos(eclLat)
  const sinLat = Math.sin(eclLat)

  const l = cosLat * Math.cos(eclLon)
  const m = Math.cos(obliquity) * cosLat * Math.sin(eclLon) - Math.sin(obliquity) * sinLat
  const n = Math.sin(obliquity) * cosLat * Math.sin(eclLon) + Math.cos(obliquity) * sinLat

  const range = EARTH_RADIUS / Math.sin(parallax)
  return [range * l, range * m, range * n]
}

/**
 * Geocentric **J2000 equatorial** position of the Moon (m) at `date`.
 *
 * `moonGeocentricMeanOfDateSi` rotated to J2000, so the output is
 * frame-consistent with the heliocentric states above and with any ICRF
 * reference. Skipping that rotation costs about 2400 km at 2030 and grows
 * with epoch, which is why it is not left to the caller.
 */
export function moonGeocentricEciSi(date: Date): Vec3 {
  const T = centuriesSinceJ2000(date)
  return precessOfDateToJ2000(moonGeocentricMeanOfDateSi(date), T)
}

/** Rotate a J2000 equatorial vector into the J2000 ecliptic frame. */
function equatorialToEcliptic(v: Vec3): Vec3 {
  const ce = Math.cos(J2000_OBLIQUITY_RAD)
  const se = Math.sin(J2000_OBLIQUITY_RAD)
  return [v[0], ce * v[1] + se * v[2], -se * v[1] + ce * v[2]]
}

/**
 * Lunar mass fraction of the Earth-Moon system, m_M / (m_E + m_M), from the
 * standard mass ratio m_E / m_M = 81.300588.
 */
export const MOON_MASS_FRACTION = 1 / 82.300588

/**
 * Heliocentric J2000 ecliptic position of **Earth's centre** (m).
 *
 * Standish's table gives the Earth-Moon barycentre, which trails Earth's
 * centre by the lunar offset. Since
 * `r_bary = r_earth + (m_M / (m_E + m_M)) * r_moon_geocentric`, subtracting
 * that fraction of the geocentric Moon vector recovers the Earth. The Moon
 * vector is equatorial and the barycentre is ecliptic, so it is rotated
 * first.
 *
 * The correction carries the Moon model's own error scaled by the same
 * fraction, so it adds roughly 1.2% of the lunar error, a few tens of km.
 * That is far smaller than the barycentre offset it removes, which reaches
 * about 4671 km.
 */
export function earthHeliocentricEclipticSi(date: Date): Vec3 {
  const bary = planetHeliocentricEclipticSi('earth', date)
  const moon = equatorialToEcliptic(moonGeocentricEciSi(date))
  return [
    bary[0] - MOON_MASS_FRACTION * moon[0],
    bary[1] - MOON_MASS_FRACTION * moon[1],
    bary[2] - MOON_MASS_FRACTION * moon[2],
  ]
}

/** Rotate a J2000 ecliptic vector into the J2000 equatorial frame. */
function eclipticToEquatorial(v: Vec3): Vec3 {
  const ce = Math.cos(J2000_OBLIQUITY_RAD)
  const se = Math.sin(J2000_OBLIQUITY_RAD)
  return [v[0], ce * v[1] - se * v[2], se * v[1] + ce * v[2]]
}

/** Bodies that can be placed in the sky as seen from Earth's centre. */
export type ObservableBodyId = PlanetId | 'moon'

/**
 * Geocentric position (m) in the **mean equator and equinox of date**.
 *
 * This is the frame GMST is defined against, so it is the one to use when
 * placing a body in an Earth-fixed view: rotating a J2000 vector by GMST
 * instead mixes two equinoxes and injects the full accumulated precession,
 * about 0.36 deg by 2026, which is nearly a lunar diameter.
 *
 * Planets take the long way round, since their model is heliocentric:
 * subtract Earth's centre from the planet in the J2000 ecliptic, rotate to
 * J2000 equatorial by the obliquity, then precess J2000 to of-date. Earth's
 * centre comes from `earthHeliocentricEclipticSi`, not the barycentre, because
 * a 4671 km error at the observer is a real direction error here.
 *
 * The Moon takes the short way: `moonGeocentricMeanOfDateSi` is already in
 * this frame, so it is returned as-is. It is deliberately not routed through
 * `moonGeocentricEciSi`, which would precess to J2000 only to precess straight
 * back; the raw series is both cheaper and exact rather than round-tripped.
 *
 * What this is not: an apparent place. There is no light-time correction, no
 * stellar aberration and no nutation, so this is the geometric direction in
 * the mean frame. See `planets.test.ts` for the measured size of each omitted
 * term against JPL Horizons.
 */
export function bodyGeocentricEquatorialOfDateSi(body: ObservableBodyId, date: Date): Vec3 {
  if (body === 'moon') return moonGeocentricMeanOfDateSi(date)

  const planet = planetHeliocentricEclipticSi(body, date)
  const earth = earthHeliocentricEclipticSi(date)
  const geocentricEcliptic: Vec3 = [
    planet[0] - earth[0],
    planet[1] - earth[1],
    planet[2] - earth[2],
  ]
  return precessJ2000ToOfDate(eclipticToEquatorial(geocentricEcliptic), centuriesSinceJ2000(date))
}

/**
 * Geocentric equatorial-of-date position (m) of a planet placed at an ARBITRARY
 * point of its own orbit, with Earth held where it actually is at `date`.
 *
 * This is what draws a planet's orbit on the sky. The obvious alternative,
 * sampling `bodyGeocentricEquatorialOfDateSi` forward in time until the planet
 * comes back round, is not the same curve and not a usable one: Earth would
 * travel too, adding one parallax loop per YEAR, so Jupiter's orbit would come
 * back as twelve overlapping epicycles and Neptune's as a hundred and sixty
 * five. Freezing Earth removes exactly that, and leaves the geometric thing a
 * viewer means by "the orbit": the closed ring the planet actually travels,
 * seen from here, now.
 *
 * Same frame chain as `bodyGeocentricEquatorialOfDateSi`, deliberately: the
 * marker is drawn from that one, and a marker that did not sit on its own ring
 * would be the fault this exists to fix. Passing `elements.M_rad` reproduces
 * it exactly.
 */
export function planetOrbitGeocentricOfDateSi(
  planet: PlanetId,
  date: Date,
  meanAnomalyRad: number,
): Vec3 {
  const elements = planetElementsAt(planet, date)
  const at = planetPositionFromElementsSi(elements, meanAnomalyRad)
  const earth = earthHeliocentricEclipticSi(date)
  const geocentricEcliptic: Vec3 = [at[0] - earth[0], at[1] - earth[1], at[2] - earth[2]]
  return precessJ2000ToOfDate(eclipticToEquatorial(geocentricEcliptic), centuriesSinceJ2000(date))
}

/**
 * The same, for the Sun: its apparent circuit IS Earth's orbit seen from the
 * inside, so the ring is swept by moving EARTH round and looking back.
 */
export function sunOrbitGeocentricOfDateSi(date: Date, meanAnomalyRad: number): Vec3 {
  const elements = planetElementsAt('earth', date)
  const at = planetPositionFromElementsSi(elements, meanAnomalyRad)
  return precessJ2000ToOfDate(
    eclipticToEquatorial([-at[0], -at[1], -at[2]]),
    centuriesSinceJ2000(date),
  )
}

/** Mean anomaly (rad) a body is at right now, which is where its marker sits on the ring. */
export function orbitMeanAnomalyRad(planet: PlanetId, date: Date): number {
  return planetElementsAt(planet, date).M_rad
}

/** One sidereal month in ms: the Moon closes its own geocentric ring in this. */
export const SIDEREAL_MONTH_MS = 27.321661 * 86400_000

/**
 * Angular diameter (rad) of `body` seen from Earth's centre at `date`,
 * `2 asin(R / d)` with R the body's radius from `BODIES`.
 *
 * `BODIES` carries mean radii. Horizons reports the equatorial angular width,
 * so the two differ for the flattened giants: 2.3% for Jupiter and 3.5% for
 * Saturn, where equatorial and mean radii are furthest apart. The value here
 * is the mean-sphere diameter, which is what a spherical billboard should use.
 */
export function bodyApparentAngularDiameterRad(body: ObservableBodyId, date: Date): number {
  const radius = getBody(body).radius
  const distance = vnorm(bodyGeocentricEquatorialOfDateSi(body, date))
  return 2 * Math.asin(radius / distance)
}

export type BodyId = 'sun' | PlanetId | 'moon'

/** Every body with a rotation model here, Sun first. */
export const BODY_IDS: readonly BodyId[] = ['sun', ...PLANET_IDS, 'moon']

/** IAU body orientation at an epoch, in the ICRF. */
export type BodyOrientation = {
  /** Right ascension of the north pole (rad) */
  poleRaRad: number
  /** Declination of the north pole (rad) */
  poleDecRad: number
  /** Prime meridian angle W, measured about the pole (rad), wrapped to [0, 2π) */
  wRad: number
}

/**
 * One body's rotational elements in the kernel's own units, so the numbers
 * stay diffable against the vendored `pck00011.tpc`.
 */
type RotationRow = {
  /** Pole RA: deg, deg/century, deg/century² (`BODY*_POLE_RA`) */
  poleRa: readonly [number, number, number]
  /** Pole declination: deg, deg/century, deg/century² (`BODY*_POLE_DEC`) */
  poleDec: readonly [number, number, number]
  /** Prime meridian: deg, deg/day, deg/day² (`BODY*_PM`) */
  pm: readonly [number, number, number]
}

/** NAIF body codes, for tracing each row back to the kernel. */
export const NAIF_BODY_CODE: Readonly<Record<BodyId, number>> = {
  sun: 10,
  mercury: 199,
  venus: 299,
  earth: 399,
  mars: 499,
  jupiter: 599,
  saturn: 699,
  uranus: 799,
  neptune: 899,
  moon: 301,
}

/**
 * Polynomial rotational elements, transcribed from the `\begindata` blocks of
 * the vendored `pck00011.tpc`. Verified against that file by `planets.test.ts`.
 */
export const BODY_ROTATION: Readonly<Record<BodyId, RotationRow>> = {
  sun: {
    poleRa: [286.13, 0, 0],
    poleDec: [63.87, 0, 0],
    pm: [84.176, 14.1844, 0],
  },
  mercury: {
    poleRa: [281.0103, -0.0328, 0],
    poleDec: [61.4155, -0.0049, 0],
    pm: [329.5988, 6.1385108, 0],
  },
  venus: {
    poleRa: [272.76, 0, 0],
    poleDec: [67.16, 0, 0],
    pm: [160.2, -1.4813688, 0],
  },
  earth: {
    poleRa: [0, -0.641, 0],
    poleDec: [90, -0.557, 0],
    pm: [190.147, 360.9856235, 0],
  },
  mars: {
    poleRa: [317.269202, -0.10927547, 0],
    poleDec: [54.432516, -0.05827105, 0],
    pm: [176.049863, 350.891982443297, 0],
  },
  jupiter: {
    poleRa: [268.056595, -0.006499, 0],
    poleDec: [64.495303, 0.002413, 0],
    pm: [284.95, 870.536, 0],
  },
  saturn: {
    poleRa: [40.589, -0.036, 0],
    poleDec: [83.537, -0.004, 0],
    pm: [38.9, 810.7939024, 0],
  },
  uranus: {
    poleRa: [257.311, 0, 0],
    poleDec: [-15.175, 0, 0],
    pm: [203.81, -501.1600928, 0],
  },
  neptune: {
    poleRa: [299.36, 0, 0],
    poleDec: [43.46, 0, 0],
    pm: [249.978, 541.1397757, 0],
  },
  moon: {
    poleRa: [269.9949, 0.0031, 0],
    poleDec: [66.5392, 0.013, 0],
    pm: [38.3213, 13.17635815, -1.4e-12],
  },
}

/**
 * A body's nutation-precession series, transcribed from the kernel.
 *
 * `angles` holds the phase arguments as polynomial coefficients in Julian
 * centuries past J2000, ascending order, exactly as the kernel's
 * `BODY<system>_NUT_PREC_ANGLES` lists them. Most are linear; Mars carries a
 * quadratic term, which is why the coefficient count is per-row rather than
 * fixed.
 *
 * The amplitude arrays are the kernel's `BODY<body>_NUT_PREC_RA`, `_DEC` and
 * `_PM`, in degrees, applied as `sin` for right ascension and W and `cos` for
 * declination. They may be shorter than `angles`: an amplitude array of
 * length n uses the first n angles.
 */
export type NutationSeries = {
  angles: readonly (readonly number[])[]
  ra: readonly number[]
  dec: readonly number[]
  pm: readonly number[]
}

/**
 * Periodic terms for the bodies whose series is large enough to matter. Every
 * value is transcribed from the vendored kernel and re-verified against it by
 * `planets.test.ts`.
 *
 * Mercury and Jupiter are absent on purpose: their peak amplitudes are
 * 0.011 deg and 0.002 deg, below the 0.05 deg threshold this module uses, and
 * the audit pins those peaks so a kernel update cannot grow them unnoticed.
 * The Sun, Venus, Earth, Saturn and Uranus have no periodic series at all.
 */
export const BODY_NUTATION: Readonly<Partial<Record<BodyId, NutationSeries>>> = {
  /** Angles E1 to E13 from `BODY3_NUT_PREC_ANGLES`; the complete published set. */
  moon: {
    angles: [
      [125.045, -1935.5364525],
      [250.089, -3871.072905],
      [260.008, 475263.3328725],
      [176.625, 487269.629985],
      [357.529, 35999.0509575],
      [311.589, 964468.49931],
      [134.963, 477198.869325],
      [276.617, 12006.300765],
      [34.226, 63863.5132425],
      [15.134, -5806.6093575],
      [119.743, 131.84064],
      [239.961, 6003.1503825],
      [25.053, 473327.79642],
    ],
    ra: [-3.8787, -0.1204, 0.07, -0.0172, 0.0, 0.0072, 0.0, 0.0, 0.0, -0.0052, 0.0, 0.0, 0.0043],
    dec: [
      1.5419, 0.0239, -0.0278, 0.0068, 0.0, -0.0029, 0.0009, 0.0, 0.0, 0.0008, 0.0, 0.0, -0.0009,
    ],
    pm: [
      3.561, 0.1208, -0.0642, 0.0158, 0.0252, -0.0066, -0.0047, -0.0046, 0.0028, 0.0052, 0.004,
      0.0019, -0.0044,
    ],
  },
  /**
   * 26 angles from `BODY4_NUT_PREC_ANGLES`. The kernel sets
   * `BODY4_MAX_PHASE_DEGREE = 2`, so these are quadratic: three coefficients
   * each, and the fifth angle is the only one whose quadratic term is nonzero.
   */
  mars: {
    angles: [
      [190.72646643, 15917.10818695, 0.0],
      [21.4689247, 31834.27934054, 0.0],
      [332.86082793, 19139.89694742, 0.0],
      [394.93256437, 38280.79631835, 0.0],
      [189.6327156, 41215158.1842005, 12.711923222],
      [121.46893664, 660.22803474, 0.0],
      [231.05028581, 660.9912354, 0.0],
      [251.37314025, 1320.50145245, 0.0],
      [217.98635955, 38279.9612555, 0.0],
      [196.19729402, 19139.83628608, 0.0],
      [198.991226, 19139.4819985, 0.0],
      [226.292679, 38280.8511281, 0.0],
      [249.663391, 57420.7251593, 0.0],
      [266.18351, 76560.636795, 0.0],
      [79.398797, 0.5042615, 0.0],
      [122.433576, 19139.9407476, 0.0],
      [43.058401, 38280.8753272, 0.0],
      [57.663379, 57420.7517205, 0.0],
      [79.476401, 76560.6495004, 0.0],
      [166.325722, 0.5042615, 0.0],
      [129.071773, 19140.0328244, 0.0],
      [36.352167, 38281.0473591, 0.0],
      [56.668646, 57420.929536, 0.0],
      [67.364003, 76560.2552215, 0.0],
      [104.79268, 95700.4387578, 0.0],
      [95.391654, 0.5042615, 0.0],
    ],
    ra: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 6.8e-5, 0.000238, 5.2e-5, 9e-6, 0.419057,
    ],
    dec: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.1e-5, 0.000141,
      3.1e-5, 5e-6, 1.591274,
    ],
    pm: [
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      0.0, 0.0, 0.000145, 0.000157, 4e-5, 1e-6, 1e-6, 0.584542,
    ],
  },
  /**
   * Angles N and N1 to N7 from `BODY8_NUT_PREC_ANGLES`. Only the first
   * carries a nonzero amplitude, so Neptune's periodic model is the single
   * term in N. The kernel lists further angles past these eight, but they
   * belong to Neptune's satellites and no planetary amplitude references them.
   */
  neptune: {
    angles: [
      [357.85, 52.316],
      [323.92, 62606.6],
      [220.51, 55064.2],
      [354.27, 46564.5],
      [75.31, 26109.4],
      [35.36, 14325.4],
      [142.61, 2824.6],
      [177.85, 52.316],
    ],
    ra: [0.7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    dec: [-0.51, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    pm: [-0.48, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  },
}

/** Wrap radians to [0, 2π). */
function wrapTwoPi(x: number): number {
  const TWO_PI = 2 * Math.PI
  return ((x % TWO_PI) + TWO_PI) % TWO_PI
}

/**
 * IAU pole direction and prime-meridian angle of `body` at `date`, in the
 * ICRF, following the kernel's own convention: pole terms are polynomials in
 * Julian centuries past J2000 TDB, the prime meridian is a polynomial in days
 * past J2000 TDB.
 *
 * **Included:** all polynomial terms for every body, plus the complete
 * periodic series of the Moon (13 terms), Mars (26) and Neptune (8), each the
 * full published set rather than a truncation.
 *
 * **Excluded:** the periodic series of Mercury and Jupiter, whose peak
 * amplitudes are 0.011 deg and 0.002 deg. Those are the only two bodies here
 * with a series below the 0.05 deg threshold; the Sun, Venus, Earth, Saturn
 * and Uranus have none at all. `planets.test.ts` pins both peaks so a kernel
 * update that enlarged either one would fail rather than pass quietly.
 *
 * Mars is the reason the threshold exists. Its three largest amplitudes,
 * 0.419 deg in RA, 1.591 deg in declination and 0.585 deg in W, attach to an
 * angle advancing at 0.5042615 deg/century, a period near 714000 years. They
 * are not oscillations on any timescale this catalog covers: dropping them
 * would tilt the planet by a near-constant 1.5 deg, which is the kind of error
 * that is visible on sight in an orrery.
 */
export function bodyOrientation(body: BodyId, date: Date): BodyOrientation {
  const row = BODY_ROTATION[body]
  const jd = julianDate(date)
  const d = jd - JD_J2000
  const T = d / DAYS_PER_JULIAN_CENTURY

  let raDeg = row.poleRa[0] + row.poleRa[1] * T + row.poleRa[2] * T * T
  let decDeg = row.poleDec[0] + row.poleDec[1] * T + row.poleDec[2] * T * T
  let wDeg = row.pm[0] + row.pm[1] * d + row.pm[2] * d * d

  const series = BODY_NUTATION[body]
  if (series) {
    for (let k = 0; k < series.angles.length; k++) {
      let angleDeg = 0
      const coefficients = series.angles[k]
      for (let p = coefficients.length - 1; p >= 0; p--) angleDeg = angleDeg * T + coefficients[p]
      const e = angleDeg * DEG
      raDeg += (series.ra[k] ?? 0) * Math.sin(e)
      decDeg += (series.dec[k] ?? 0) * Math.cos(e)
      wDeg += (series.pm[k] ?? 0) * Math.sin(e)
    }
  }

  return {
    poleRaRad: wrapTwoPi(raDeg * DEG),
    poleDecRad: decDeg * DEG,
    wRad: wrapTwoPi(wDeg * DEG),
  }
}
