/**
 * Golden tests for the planetary and lunar ephemeris.
 *
 * The reference vectors are the raw JPL Horizons API responses vendored under
 * `golden/data/`, parsed here rather than transcribed, so no hand-copied
 * number sits between the published truth and the assertion. Provenance,
 * SHA-256 and the exact API parameters are in `golden/data/README.md`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BODY_IDS,
  BODY_NUTATION,
  BODY_ROTATION,
  J2000_OBLIQUITY_RAD,
  MOON_MASS_FRACTION,
  NAIF_BODY_CODE,
  PLANET_ELEMENTS_J2000,
  PLANET_IDS,
  PLANET_NOMINAL_ERROR,
  bodyApparentAngularDiameterRad,
  bodyGeocentricEquatorialOfDateSi,
  bodyOrientation,
  earthHeliocentricEclipticSi,
  julianDate,
  type ObservableBodyId,
  moonGeocentricEciSi,
  moonGeocentricMeanOfDateSi,
  planetElementsAt,
  planetHeliocentricEclipticSi,
  planetHeliocentricEquatorialSi,
  planetPositionFromElementsSi,
  type BodyId,
  type PlanetId,
} from './planets'
import { getBody } from './bodies'
import { vnorm, vsub, type Vec3 } from './vector'

const dataPath = (name: string) => fileURLToPath(new URL(`./golden/data/${name}`, import.meta.url))
const readData = (name: string) => readFileSync(dataPath(name), 'utf8')

/** Horizons body ids used for each planet; see the README for why Earth is 3. */
const HORIZONS_FILE: Record<PlanetId, string> = {
  mercury: 'horizons-199-mercury.txt',
  venus: 'horizons-299-venus.txt',
  earth: 'horizons-3-embary.txt',
  mars: 'horizons-499-mars.txt',
  jupiter: 'horizons-599-jupiter.txt',
  saturn: 'horizons-699-saturn.txt',
  uranus: 'horizons-799-uranus.txt',
  neptune: 'horizons-899-neptune.txt',
}

type HorizonsRow = { jd: number; date: Date; r: Vec3 }

/**
 * Pull the CSV rows between the `$$SOE` / `$$EOE` markers of a Horizons
 * VECTORS response. Columns are JD, calendar date, then X, Y, Z in km.
 */
function parseHorizons(text: string): HorizonsRow[] {
  const rows: HorizonsRow[] = []
  let inside = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('$$SOE')) {
      inside = true
      continue
    }
    if (line.startsWith('$$EOE')) break
    if (!inside) continue
    const f = line.split(',').map((s) => s.trim())
    if (f.length < 5) continue
    rows.push({
      jd: Number(f[0]),
      date: new Date((Number(f[0]) - 2440587.5) * 86_400_000),
      r: [Number(f[2]) * 1000, Number(f[3]) * 1000, Number(f[4]) * 1000],
    })
  }
  return rows
}

/*
 * EMPIRICALLY CALIBRATED, NOT A PUBLISHED ACCURACY CLAIM. Vallado states no
 * accuracy figure for Algorithm 31, so this bound comes from measurement:
 * 4001 epochs from 2000-01-15 to 2035-01-15, neither golden epoch among them,
 * gave a maximum deviation from Horizons of 2323.9 km. 1.25x that is
 * 2904.8 km, rounded up to a clean 3000 km. The procedure is written up in
 * golden/data/README.md.
 */
const MOON_TOLERANCE_M = 3_000_000

/*
 * EMPIRICALLY CALIBRATED for the same reason, but a different one: Neptune's
 * published nominal error demonstrably understates this model's disagreement
 * with modern ephemerides, so there is no honest published bound to use. 201
 * epochs from 1800-01-15 to 2049-12-15, neither golden epoch among them, gave
 * a maximum deviation of 1590300.2 km. 1.25x that is 1987875.2 km, rounded up
 * to 2e6 km. The other seven planets stay on the published-derived envelope.
 */
const NEPTUNE_TOLERANCE_M = 2.0e9

/**
 * Absolute position tolerance derived from the body's published nominal
 * error, evaluated at its actual heliocentric distance: the radial term plus
 * the two angular terms turned into distances. Summing the three components
 * rather than taking their root-sum-square is the generous reading, and it is
 * the only step between the published table and the bound. No per-body
 * adjustment is applied anywhere.
 */
function publishedToleranceM(planet: PlanetId, truth: Vec3): number {
  const { lon_rad, lat_rad, range_m } = PLANET_NOMINAL_ERROR[planet]
  const d = vnorm(truth)
  return range_m + d * lon_rad + d * lat_rad
}

describe('Standish Table 1 transcription audit', () => {
  const html = readData('standish-approx-pos.html')

  it('every element and rate matches the vendored JPL page', () => {
    const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
    expect(pre, 'Table 1 <pre> block not found in the vendored page').toBeTruthy()
    const lines = pre![1].replace(/&amp;/g, '&').split('\n')

    // The page labels the Earth row by the barycentre it actually describes.
    const label: Record<PlanetId, string> = {
      mercury: 'Mercury',
      venus: 'Venus',
      earth: 'EM Bary',
      mars: 'Mars',
      jupiter: 'Jupiter',
      saturn: 'Saturn',
      uranus: 'Uranus',
      neptune: 'Neptune',
    }

    let cells = 0
    for (const id of PLANET_IDS) {
      const i = lines.findIndex((l) => l.trim().startsWith(label[id]))
      expect(i, `row "${label[id]}" not found`).toBeGreaterThanOrEqual(0)

      const published = (line: string) =>
        (line.match(/-?\d+\.?\d*/g) ?? []).map(Number)
      const values = published(lines[i].replace(label[id], ''))
      const rates = published(lines[i + 1])

      const row = PLANET_ELEMENTS_J2000[id]
      const mine = [row.a, row.e, row.i, row.L, row.lonPeri, row.lonNode]
      expect(values, `${id}: element count`).toHaveLength(6)
      expect(rates, `${id}: rate count`).toHaveLength(6)

      for (let c = 0; c < 6; c++) {
        expect(mine[c][0], `${id} column ${c} value`).toBe(values[c])
        expect(mine[c][1], `${id} column ${c} rate`).toBe(rates[c])
        cells += 2
      }
    }
    expect(cells).toBe(96)
  })

  it('the published nominal-error table matches PLANET_NOMINAL_ERROR', () => {
    const arcsec = Math.PI / (180 * 3600)
    /*
     * First numeric table on the page, first three data columns are the
     * 1800-2050 lambda / phi / rho figures.
     */
    const table = html.match(/<table[\s\S]*?<\/table>/i)
    expect(table).toBeTruthy()
    const rows = table![0].match(/<tr[\s\S]*?<\/tr>/gi) ?? []
    const cellsOf = (tr: string) =>
      (tr.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map((c) =>
        c.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim(),
      )

    const label: Record<PlanetId, string> = {
      mercury: 'Mercury',
      venus: 'Venus',
      earth: 'EM Bary',
      mars: 'Mars',
      jupiter: 'Jupiter',
      saturn: 'Saturn',
      uranus: 'Uranus',
      neptune: 'Neptune',
    }

    for (const id of PLANET_IDS) {
      const tr = rows.find((r) => cellsOf(r)[0]?.startsWith(label[id]))
      expect(tr, `${id}: accuracy row not found`).toBeTruthy()
      const c = cellsOf(tr!)
      const mine = PLANET_NOMINAL_ERROR[id]
      expect(mine.lon_rad / arcsec, `${id} lambda`).toBeCloseTo(Number(c[1]), 9)
      expect(mine.lat_rad / arcsec, `${id} phi`).toBeCloseTo(Number(c[2]), 9)
      expect(mine.range_m / 1e6, `${id} rho`).toBeCloseTo(Number(c[3]), 9)
    }
  })
})

describe('Vallado Algorithm 31 transcription audit', () => {
  it('reproduces the vendored moon.m run to the Earth-radius scale factor', () => {
    /*
     * Reference values produced by running the vendored `vallado-moon.m`
     * unmodified under Octave with its own constmath.m / constastro.m, then
     * scaling by that file's re = 6378.1363 km. Rescaling by this codebase's
     * 6378.137 km is the whole of the expected difference, so the check is
     * exact to 1e-9 relative.
     */
    const vallado: Array<{ jd: number; km: Vec3 }> = [
      { jd: 2451544.5, km: [-317731.455708852, -236436.033723606, -62419.049341797] },
      { jd: 2462502.5, km: [-189994.144896606, -279292.015060435, -136822.601790113] },
      { jd: 2449470.5, km: [-134240.611113044, -311571.556163826, -126693.770789521] },
      { jd: 2378496.5, km: [384033.601489236, -61231.225359993, -53838.962832112] },
      { jd: 2469807.5, km: [357642.263881222, 101627.191524317, 69066.232190434] },
    ]
    const scale = 6378.137 / 6378.1363

    for (const { jd, km } of vallado) {
      const date = new Date((jd - 2440587.5) * 86_400_000)
      // The of-date form, so the audit sees the series and nothing else.
      const mine = moonGeocentricMeanOfDateSi(date)
      for (let c = 0; c < 3; c++) {
        const expected = km[c] * 1000 * scale
        expect(mine[c] / expected, `JD ${jd} component ${c}`).toBeCloseTo(1, 9)
      }
    }
  })
})

describe('planet positions vs JPL Horizons', () => {
  for (const id of PLANET_IDS) {
    const rows = parseHorizons(readData(HORIZONS_FILE[id]))
    const calibrated = id === 'neptune'
    const what = calibrated ? 'its calibrated bound' : 'its published nominal error'

    it(`${id} is inside ${what} at both pinned epochs`, () => {
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(julianDate(row.date)).toBeCloseTo(row.jd, 9)
        const mine = planetHeliocentricEclipticSi(id, row.date)
        const deviation = vnorm(vsub(mine, row.r))
        const tolerance = calibrated ? NEPTUNE_TOLERANCE_M : publishedToleranceM(id, row.r)
        expect(
          deviation,
          `${id} @ JD ${row.jd}: ${(deviation / 1000).toFixed(1)} km vs tolerance ${(
            tolerance / 1000
          ).toFixed(1)} km`,
        ).toBeLessThanOrEqual(tolerance)
      }
    })
  }

  it("earth's lunar-offset correction lands on Horizons' Earth, not the barycentre", () => {
    const rows = parseHorizons(readData('horizons-399-earth.txt'))
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      /*
       * The correction propagates the Moon model's error scaled by the same
       * mass fraction, so the bound is the barycentre envelope plus that.
       */
      const tolerance =
        publishedToleranceM('earth', row.r) + MOON_TOLERANCE_M * MOON_MASS_FRACTION
      const deviation = vnorm(vsub(earthHeliocentricEclipticSi(row.date), row.r))
      expect(
        deviation,
        `earth @ JD ${row.jd}: ${(deviation / 1000).toFixed(1)} km vs tolerance ${(
          tolerance / 1000
        ).toFixed(1)} km`,
      ).toBeLessThanOrEqual(tolerance)

      /*
       * The correction has to actually do something: the uncorrected
       * barycentre sits about 4700 km from Earth's centre.
       */
      const uncorrected = planetHeliocentricEclipticSi('earth', row.date)
      expect(vnorm(vsub(uncorrected, earthHeliocentricEclipticSi(row.date)))).toBeGreaterThan(
        4_000_000,
      )
    }
  })
})

describe('Moon position vs JPL Horizons', () => {
  const rows = parseHorizons(readData('horizons-301-moon-eq.txt'))

  it('matches at both pinned epochs within the calibrated bound', () => {
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const deviation = vnorm(vsub(moonGeocentricEciSi(row.date), row.r))
      expect(
        deviation,
        `moon @ JD ${row.jd}: ${(deviation / 1000).toFixed(1)} km`,
      ).toBeLessThanOrEqual(MOON_TOLERANCE_M)
    }
  })

  it("matches Vallado's published DE430 check vector for 1994-04-28", () => {
    // Printed in ex5_3.m inside the same sha256-pinned archive as the series.
    const truth: Vec3 = [-134038.3192e3, -311589.2121e3, -126061.1912e3]
    const date = new Date(Date.UTC(1994, 3, 28, 0, 0, 0))
    const deviation = vnorm(vsub(moonGeocentricEciSi(date), truth))
    expect(deviation, `ex5-3: ${(deviation / 1000).toFixed(1)} km`).toBeLessThanOrEqual(
      MOON_TOLERANCE_M,
    )
  })

  it('is rotated to J2000, not left in the mean equator of date', () => {
    /*
     * Precession is the difference between the two frames and it grows with
     * epoch, so a module that skipped the rotation would drift. At 2030 the
     * raw series sits about 3700 km from Horizons and the rotated one about
     * 1275 km, so a bound between the two separates the cases.
     */
    const deviation = vnorm(vsub(moonGeocentricEciSi(rows[1].date), rows[1].r))
    expect(deviation).toBeLessThan(2_000_000)
  })
})

describe('NAIF pck00011.tpc transcription audit', () => {
  /**
   * Collect the kernel's live assignments. Only text inside a `\begindata`
   * block is data; the file also carries superseded values in `\begintext`
   * commentary, which must not be read.
   */
  const liveAssignments = (): Record<string, number[]> => {
    const out: Record<string, number[]> = {}
    let live = false
    let buffer = ''
    for (const line of readData('pck00011.tpc').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '\\begindata') {
        live = true
        buffer = ''
        continue
      }
      if (trimmed === '\\begintext') {
        live = false
        buffer = ''
        continue
      }
      if (live) buffer += ` ${line}`
      for (;;) {
        const m = buffer.match(/(BODY\d+_[A-Z_]+)\s*=\s*\(([^)]*)\)/)
        if (!m) break
        // The kernel writes Fortran-style exponents, e.g. -1.4D-12.
        out[m[1]] = m[2].replace(/D/g, 'E').trim().split(/\s+/).map(Number)
        buffer = buffer.slice(m.index! + m[0].length)
      }
    }
    return out
  }

  const kernel = liveAssignments()

  it('every pole and prime-meridian coefficient matches the vendored kernel', () => {
    let checked = 0
    for (const id of BODY_IDS) {
      const code = NAIF_BODY_CODE[id]
      const row = BODY_ROTATION[id]
      for (const [suffix, mine] of [
        ['POLE_RA', row.poleRa],
        ['POLE_DEC', row.poleDec],
        ['PM', row.pm],
      ] as const) {
        const published = kernel[`BODY${code}_${suffix}`]
        expect(published, `BODY${code}_${suffix} not found in kernel`).toBeTruthy()
        for (let c = 0; c < 3; c++) {
          expect(mine[c], `${id} ${suffix}[${c}]`).toBe(published[c])
          checked++
        }
      }
    }
    // 10 bodies x 3 quantities x 3 coefficients.
    expect(checked).toBe(90)
  })

  it('every carried nutation series matches the kernel in full', () => {
    /*
     * Each body's phase angles live on its system barycentre: the Moon's on
     * body 3, Mars' on 4, Neptune's on 8.
     */
    const cases = [
      { body: 'moon' as BodyId, angleKey: 'BODY3_NUT_PREC_ANGLES', perAngle: 2, count: 13 },
      { body: 'mars' as BodyId, angleKey: 'BODY4_NUT_PREC_ANGLES', perAngle: 3, count: 26 },
      { body: 'neptune' as BodyId, angleKey: 'BODY8_NUT_PREC_ANGLES', perAngle: 2, count: 8 },
    ]

    let checked = 0
    for (const { body, angleKey, perAngle, count } of cases) {
      const series = BODY_NUTATION[body]
      expect(series, `${body}: series missing`).toBeTruthy()
      const angles = kernel[angleKey]
      expect(angles.length, `${angleKey} length`).toBeGreaterThanOrEqual(perAngle * count)

      expect(series!.angles, `${body}: angle count`).toHaveLength(count)
      for (let k = 0; k < count; k++) {
        expect(series!.angles[k], `${body} angle ${k + 1} width`).toHaveLength(perAngle)
        for (let p = 0; p < perAngle; p++) {
          expect(series!.angles[k][p], `${body} angle ${k + 1} coefficient ${p}`).toBe(
            angles[perAngle * k + p],
          )
          checked++
        }
      }

      const code = NAIF_BODY_CODE[body]
      for (const [suffix, mine] of [
        ['RA', series!.ra],
        ['DEC', series!.dec],
        ['PM', series!.pm],
      ] as const) {
        const published = kernel[`BODY${code}_NUT_PREC_${suffix}`]
        // Full published set, never a truncation.
        expect(mine, `${body} ${suffix} length`).toHaveLength(published.length)
        for (let k = 0; k < published.length; k++) {
          expect(mine[k], `${body} ${suffix}[${k}]`).toBe(published[k])
          checked++
        }
      }
    }
    // Moon 26 + 39, Mars 78 + 61, Neptune 16 + 24.
    expect(checked).toBe(244)
  })

  it('carries every series above 0.05 deg and no body is silently missed', () => {
    const peak = (name: string) => Math.max(0, ...(kernel[name] ?? []).map(Math.abs))
    const THRESHOLD = 0.05

    for (const body of BODY_IDS) {
      const code = NAIF_BODY_CODE[body]
      const largest = Math.max(
        peak(`BODY${code}_NUT_PREC_RA`),
        peak(`BODY${code}_NUT_PREC_DEC`),
        peak(`BODY${code}_NUT_PREC_PM`),
      )
      const carried = BODY_NUTATION[body] !== undefined
      expect(
        carried,
        `${body}: peak ${largest.toFixed(4)} deg but carried=${carried}`,
      ).toBe(largest > THRESHOLD)
    }

    /*
     * The two deliberate exclusions, pinned so a kernel update that enlarged
     * either one would fail here rather than pass quietly.
     */
    expect(peak('BODY199_NUT_PREC_PM')).toBeCloseTo(0.010673, 6)
    expect(peak('BODY599_NUT_PREC_RA')).toBeCloseTo(0.00215, 6)
  })
})

describe('body orientation', () => {
  it('W advances forward for prograde rotators and backward for retrograde ones', () => {
    const start = new Date('2024-06-01T00:00:00.000Z')
    const stepMs = 3_600_000
    // Signs are the kernel's own: Venus and Uranus rotate retrograde.
    const prograde: BodyId[] = ['sun', 'mercury', 'earth', 'mars', 'jupiter', 'saturn', 'neptune']
    const retrograde: BodyId[] = ['venus', 'uranus']

    for (const body of [...prograde, ...retrograde]) {
      const forward = prograde.includes(body)
      for (let k = 0; k < 24; k++) {
        const w0 = bodyOrientation(body, new Date(start.getTime() + k * stepMs)).wRad
        const w1 = bodyOrientation(body, new Date(start.getTime() + (k + 1) * stepMs)).wRad
        /*
         * W is an angle on a circle, so monotonicity is the sign of the step
         * taken the short way round.
         */
        let step = w1 - w0
        if (step > Math.PI) step -= 2 * Math.PI
        if (step < -Math.PI) step += 2 * Math.PI
        expect(Math.sign(step), `${body} step ${k}`).toBe(forward ? 1 : -1)
      }
    }
  })

  it('W accumulates at the published rate over a full day', () => {
    /*
     * Jupiter turns 870.536 deg/day, so one day of W must equal that modulo a
     * full turn. This catches a day-versus-century mix-up in the PM term.
     */
    const t0 = new Date('2024-06-01T00:00:00.000Z')
    const t1 = new Date('2024-06-02T00:00:00.000Z')
    const advance = bodyOrientation('jupiter', t1).wRad - bodyOrientation('jupiter', t0).wRad
    const expected = ((BODY_ROTATION.jupiter.pm[1] % 360) * Math.PI) / 180
    let diff = advance - expected
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    expect(Math.abs(diff)).toBeLessThan(1e-9)
  })

  it('poles are unit-sphere valid and Uranus lies on its side', () => {
    for (const body of BODY_IDS) {
      const { poleRaRad, poleDecRad, wRad } = bodyOrientation(body, new Date('2024-06-01T00:00:00.000Z'))
      expect(poleRaRad, `${body} RA`).toBeGreaterThanOrEqual(0)
      expect(poleRaRad, `${body} RA`).toBeLessThan(2 * Math.PI)
      expect(Math.abs(poleDecRad), `${body} Dec`).toBeLessThanOrEqual(Math.PI / 2)
      expect(wRad, `${body} W`).toBeGreaterThanOrEqual(0)
      expect(wRad, `${body} W`).toBeLessThan(2 * Math.PI)
    }
    /*
     * Uranus' pole declination is -15.175 deg, the signature of its ~98 deg
     * obliquity; a sign slip here would stand the planet upright.
     */
    expect(bodyOrientation('uranus', new Date()).poleDecRad).toBeLessThan(0)
  })

  it('applies each periodic series rather than silently dropping it', () => {
    /*
     * Every carried series must move its body's pole away from the bare
     * polynomial by an amount of order its largest amplitude.
     */
    const date = new Date('2024-06-01T00:00:00.000Z')
    const T = (julianDate(date) - 2451545.0) / 36525
    const expectedShift: Partial<Record<BodyId, [number, number]>> = {
      moon: [0.1, 4.1],
      mars: [0.1, 2.0],
      neptune: [0.1, 0.8],
    }
    for (const [body, [lo, hi]] of Object.entries(expectedShift) as [
      BodyId,
      [number, number],
    ][]) {
      const row = BODY_ROTATION[body]
      const polynomialDec = row.poleDec[0] + row.poleDec[1] * T
      const shift = Math.abs((bodyOrientation(body, date).poleDecRad * 180) / Math.PI - polynomialDec)
      expect(shift, `${body} declination shift`).toBeGreaterThan(lo)
      expect(shift, `${body} declination shift`).toBeLessThan(hi)
    }
  })

  it("Mars' 2015 pole with its periodic terms agrees with the 2009 pole", () => {
    /*
     * A cross-generation check that the Mars series is transcribed and applied
     * correctly, using a value the audit above never touches. The kernel keeps
     * the superseded 2009 Mars model in its commentary:
     *
     *   body499_pole_ra  = ( 317.68143  -0.1061  0. )
     *   body499_pole_dec = (  52.88650  -0.0609  0. )
     *
     * The 2015 model reaches the same pole by a different route: a polynomial
     * displaced to 317.269202 / 54.432516 plus periodic terms that carry it
     * back. Without those terms the two models disagree by 0.41 deg in right
     * ascension and 1.55 deg in declination, so 0.01 deg here is a wide bound
     * that still cannot be met by accident.
     */
    for (const iso of ['2000-01-01T12:00:00.000Z', '2030-01-01T00:00:00.000Z']) {
      const date = new Date(iso)
      const T = (julianDate(date) - 2451545.0) / 36525
      const { poleRaRad, poleDecRad } = bodyOrientation('mars', date)
      expect(Math.abs((poleRaRad * 180) / Math.PI - (317.68143 - 0.1061 * T)), iso).toBeLessThan(
        0.01,
      )
      expect(Math.abs((poleDecRad * 180) / Math.PI - (52.8865 - 0.0609 * T)), iso).toBeLessThan(
        0.01,
      )
    }
  })
})

describe('geocentric direction vs JPL Horizons', () => {
  const OBSERVER_FILE: Record<ObservableBodyId | string, string> = {
    moon: 'horizons-obs-301-moon.txt',
    venus: 'horizons-obs-299-venus.txt',
    mars: 'horizons-obs-499-mars.txt',
    jupiter: 'horizons-obs-599-jupiter.txt',
    saturn: 'horizons-obs-699-saturn.txt',
  }

  /**
   * Everything the mean-of-date geometric chain leaves out relative to a
   * Horizons apparent place: stellar aberration, bounded by the constant of
   * aberration at 20.5 arcsec; nutation, bounded by the ~17.2 arcsec maximum
   * of the nutation in longitude; and this module's treatment of UTC as TDB,
   * worth about 69 s, which moves the Moon roughly 38 arcsec and the planets
   * under 4 arcsec.
   *
   * Measured rather than assumed: precessing Horizons' own astrometric places
   * to of-date and comparing them against its apparent places isolates the
   * aberration and nutation pair, and across the ten body-epoch pairs here it
   * peaks at 30.6 arcsec. This allowance is set above both the measured peak
   * and the analytic sum.
   */
  const OMITTED_TERMS_ARCSEC = 60

  const ARCSEC_RAD = Math.PI / (180 * 3600)
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }

  const raFromHms = (s: string) => {
    const [h, m, sec] = s.trim().split(/\s+/).map(Number)
    return ((h + m / 60 + sec / 3600) * 15 * Math.PI) / 180
  }
  const decFromDms = (s: string) => {
    const t = s.trim()
    const sign = t.startsWith('-') ? -1 : 1
    const [d, m, sec] = t.replace(/^[+-]/, '').split(/\s+/).map(Number)
    return (sign * (d + m / 60 + sec / 3600) * Math.PI) / 180
  }

  type ObserverRow = {
    date: Date
    apparentRaRad: number
    apparentDecRad: number
    angularDiameterArcsec: number
  }

  /** Parse a Horizons OBSERVER table and its published equatorial radius. */
  function parseObserver(text: string): { rows: ObserverRow[]; equatorialRadiusM: number } {
    const radii = text.match(/Target radii\s*:\s*([\d.]+)/)
    expect(radii, 'Target radii header not found').toBeTruthy()
    const rows: ObserverRow[] = []
    let inside = false
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('$$SOE')) {
        inside = true
        continue
      }
      if (line.startsWith('$$EOE')) break
      if (!inside) continue
      const c = line.split(',')
      if (c.length < 9) continue
      const m = c[0].trim().match(/(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
      expect(m, `unparsed date: ${c[0]}`).toBeTruthy()
      rows.push({
        date: new Date(
          Date.UTC(Number(m![1]), MONTHS[m![2]], Number(m![3]), Number(m![4]), Number(m![5]), Number(m![6])),
        ),
        apparentRaRad: raFromHms(c[5]),
        apparentDecRad: decFromDms(c[6]),
        angularDiameterArcsec: Number(c[7]),
      })
    }
    return { rows, equatorialRadiusM: Number(radii![1]) * 1000 }
  }

  /** Great-circle separation between two RA/Dec pairs (rad). */
  function separationRad(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const h =
      Math.sin((dec1 - dec2) / 2) ** 2 +
      Math.cos(dec1) * Math.cos(dec2) * Math.sin((ra1 - ra2) / 2) ** 2
    return 2 * Math.asin(Math.min(1, Math.sqrt(h)))
  }

  /**
   * Direction tolerance: the model's own position uncertainty, seen at the
   * body's actual geocentric distance, plus the omitted-terms allowance.
   *
   * For a planet the geocentric vector is a difference of two modelled
   * heliocentric positions, so both uncertainties enter: the planet's
   * published envelope and Earth's, the latter including the lunar-offset
   * correction the same way the Earth golden does.
   */
  function directionToleranceRad(body: ObservableBodyId, date: Date, distanceM: number): number {
    let positionErrorM: number
    if (body === 'moon') {
      positionErrorM = MOON_TOLERANCE_M
    } else {
      const planetError = publishedToleranceM(body, planetHeliocentricEclipticSi(body, date))
      const earthError =
        publishedToleranceM('earth', earthHeliocentricEclipticSi(date)) +
        MOON_TOLERANCE_M * MOON_MASS_FRACTION
      positionErrorM = planetError + earthError
    }
    return positionErrorM / distanceM + OMITTED_TERMS_ARCSEC * ARCSEC_RAD
  }

  for (const [body, file] of Object.entries(OBSERVER_FILE) as [ObservableBodyId, string][]) {
    const { rows, equatorialRadiusM } = parseObserver(readData(file))

    it(`${body} apparent RA/Dec matches within its derived bound`, () => {
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        const v = bodyGeocentricEquatorialOfDateSi(body, row.date)
        const distance = vnorm(v)
        const ra = Math.atan2(v[1], v[0])
        const dec = Math.asin(v[2] / distance)
        const deviation = separationRad(ra, dec, row.apparentRaRad, row.apparentDecRad)
        const tolerance = directionToleranceRad(body, row.date, distance)
        expect(
          deviation,
          `${body} @ ${row.date.toISOString()}: ${(deviation / ARCSEC_RAD).toFixed(1)} arcsec vs tolerance ${(
            tolerance / ARCSEC_RAD
          ).toFixed(1)} arcsec`,
        ).toBeLessThanOrEqual(tolerance)
      }
    })

    it(`${body} angular diameter matches the mean-sphere expectation`, () => {
      /*
       * Horizons publishes "the equatorial angular width", while this module
       * returns the mean-sphere diameter from the `BODIES` radius. For a body
       * close to spherical the two coincide, but Jupiter and Saturn are
       * visibly oblate and the definitions part company by 2.2% and 3.4%.
       *
       * So the expectation is not 1.0 but the ratio of the two radii, both
       * published: `BODIES` against the equatorial radius Horizons prints in
       * the header of this very file. Asserting the ratio to 2% keeps the
       * original precision instead of widening the bound to absorb a
       * definitional difference.
       */
      const expectedRatio = getBody(body).radius / equatorialRadiusM
      for (const row of rows) {
        const mine = bodyApparentAngularDiameterRad(body, row.date) / ARCSEC_RAD
        const ratio = mine / row.angularDiameterArcsec
        expect(
          Math.abs(ratio / expectedRatio - 1),
          `${body} @ ${row.date.toISOString()}: ${mine.toFixed(3)} vs ${row.angularDiameterArcsec.toFixed(
            3,
          )} arcsec, ratio ${ratio.toFixed(5)} vs expected ${expectedRatio.toFixed(5)}`,
        ).toBeLessThan(0.02)
      }
    })
  }

  it('precessing the of-date vector back to J2000 reproduces the J2000 path', () => {
    /*
     * Matrix-inverse sanity: the two rotations must compose to the identity,
     * so the round trip has to land on the J2000 chain to floating-point noise.
     */
    const date = new Date('2027-03-11T06:00:00.000Z')
    const T = (julianDate(date) - 2451545.0) / 36525

    /*
     * Reproduce precessOfDateToJ2000 here so the test exercises the module's
     * inverse rather than trusting both directions of the same helper.
     */
    const toJ2000 = (v: Vec3): Vec3 => {
      const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC_RAD
      const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC_RAD
      const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC_RAD
      let c = Math.cos(-zeta)
      let s = Math.sin(-zeta)
      const a: Vec3 = [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]
      c = Math.cos(theta)
      s = Math.sin(theta)
      const b: Vec3 = [c * a[0] + s * a[2], a[1], -s * a[0] + c * a[2]]
      c = Math.cos(-z)
      s = Math.sin(-z)
      return [c * b[0] - s * b[1], s * b[0] + c * b[1], b[2]]
    }

    /*
     * The independent J2000 path: geocentric difference in the ecliptic,
     * rotated by the obliquity, never touching the precession code.
     */
    const ce = Math.cos(J2000_OBLIQUITY_RAD)
    const se = Math.sin(J2000_OBLIQUITY_RAD)
    for (const body of PLANET_IDS) {
      const planet = planetHeliocentricEclipticSi(body, date)
      const earth = earthHeliocentricEclipticSi(date)
      const g = vsub(planet, earth)
      const expected: Vec3 = [g[0], ce * g[1] - se * g[2], se * g[1] + ce * g[2]]

      const roundTripped = toJ2000(bodyGeocentricEquatorialOfDateSi(body, date))
      const relative = vnorm(vsub(roundTripped, expected)) / vnorm(expected)
      expect(relative, `${body}: round trip`).toBeLessThan(1e-9)
    }

    /*
     * The Moon reaches J2000 by its own route, which must agree with rotating
     * the of-date vector this module hands out.
     */
    const moonRelative =
      vnorm(vsub(toJ2000(bodyGeocentricEquatorialOfDateSi('moon', date)), moonGeocentricEciSi(date))) /
      vnorm(moonGeocentricEciSi(date))
    expect(moonRelative, 'moon: round trip').toBeLessThan(1e-9)
  })
})

describe('orbit geometry properties', () => {
  const date = new Date('2024-06-01T00:00:00.000Z')

  it('a full turn of mean anomaly closes the orbit', () => {
    for (const id of PLANET_IDS) {
      const el = planetElementsAt(id, date)
      const a = planetPositionFromElementsSi(el, el.M_rad)
      const b = planetPositionFromElementsSi(el, el.M_rad + 2 * Math.PI)
      const relative = vnorm(vsub(a, b)) / vnorm(a)
      expect(relative, `${id}: closure`).toBeLessThan(1e-6)
    }
  })

  it('every planet orbits prograde about the ecliptic pole', () => {
    // Angular momentum from a short chord; its z sign is the orbit's sense.
    for (const id of PLANET_IDS) {
      const el = planetElementsAt(id, date)
      const r0 = planetPositionFromElementsSi(el, el.M_rad)
      const r1 = planetPositionFromElementsSi(el, el.M_rad + 1e-3)
      const hz = r0[0] * r1[1] - r0[1] * r1[0]
      expect(hz, `${id}: h_z`).toBeGreaterThan(0)
    }
  })

  it('the out-of-plane component follows the signed inclination', () => {
    /*
     * z = a(cos E - e) sin ω sin I + a sqrt(1-e²) sin E cos ω sin I, so the
     * sign of z tracks sin I and flips with it. Earth's Table 1 inclination is
     * a small negative number, which must survive as a sign rather than being
     * absolutised: mirroring I must mirror z.
     */
    for (const id of PLANET_IDS) {
      const el = planetElementsAt(id, date)
      const z = planetPositionFromElementsSi(el, el.M_rad)[2]
      const mirrored = planetPositionFromElementsSi({ ...el, i_rad: -el.i_rad }, el.M_rad)[2]
      expect(mirrored, `${id}: mirrored inclination`).toBeCloseTo(-z, 6)
    }
    expect(PLANET_ELEMENTS_J2000.earth.i[0]).toBeLessThan(0)
  })

  it('the equatorial transform is a rotation about x by the J2000 obliquity', () => {
    for (const id of PLANET_IDS) {
      const ecl = planetHeliocentricEclipticSi(id, date)
      const eq = planetHeliocentricEquatorialSi(id, date)
      expect(vnorm(eq) / vnorm(ecl), `${id}: length preserved`).toBeCloseTo(1, 12)
      expect(eq[0] / ecl[0], `${id}: x unchanged`).toBeCloseTo(1, 12)
    }
    expect(J2000_OBLIQUITY_RAD).toBeCloseTo((23.43928 * Math.PI) / 180, 15)
  })
})
