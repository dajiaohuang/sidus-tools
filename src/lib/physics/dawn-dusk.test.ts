// src/lib/physics/dawn-dusk.test.ts
import { describe, expect, it } from 'vitest'
import {
  betaAngle,
  dawnDuskBeta,
  dawnDuskBetaJd,
  dawnDuskSeason,
  eclipseThresholdBeta,
  julianDay,
  ltanRaanOffsetRad,
} from './dawn-dusk'
import { EARTH_RADIUS } from './constants'

const DEG = Math.PI / 180

describe('ltanRaanOffsetRad', () => {
  it('maps LTAN to Omega minus sun RA', () => {
    expect(ltanRaanOffsetRad(18)).toBeCloseTo(90 * DEG, 12)
    expect(ltanRaanOffsetRad(6)).toBeCloseTo(-90 * DEG, 12)
    expect(ltanRaanOffsetRad(12)).toBe(0)
    expect(ltanRaanOffsetRad(24)).toBeNull()
    expect(ltanRaanOffsetRad(-1)).toBeNull()
  })
})

describe('betaAngle', () => {
  const i = 97.401519 * DEG
  const d = 23.435 * DEG
  it('reduces to asin(sin(i + delta)) at LTAN 18 and -asin(sin(i - delta)) at LTAN 06', () => {
    expect(betaAngle(i, Math.PI / 2, d)).toBeCloseTo(Math.asin(Math.sin(i + d)), 9)
    expect(betaAngle(i, -Math.PI / 2, d)).toBeCloseTo(-Math.asin(Math.sin(i - d)), 9)
    expect(betaAngle(i, Math.PI / 2, d) / DEG).toBeCloseTo(59.163, 2)
    expect(betaAngle(i, -Math.PI / 2, d) / DEG).toBeCloseTo(-73.966, 2)
  })
})

describe('eclipseThresholdBeta', () => {
  it('is asin(R/a)', () => {
    expect(eclipseThresholdBeta(EARTH_RADIUS + 500_000)! / DEG).toBeCloseTo(68.018674, 4)
    expect(eclipseThresholdBeta(EARTH_RADIUS)).toBeNull()
  })
})

describe('julianDay', () => {
  it('matches the Vallado epoch algorithm', () => {
    expect(julianDay(new Date('2026-06-21T00:00:00Z'))).toBeCloseTo(2461212.5, 6)
  })
})

describe('dawnDuskBeta', () => {
  it('500 km LTAN 18 on 2026-06-21: beta 59.163 deg and a 22.65 min eclipse', () => {
    const r = dawnDuskBeta({ altitudeM: 500_000, ltanHours: 18, date: new Date('2026-06-21T00:00:00Z') })
    expect(r).not.toBeNull()
    expect(r!.inclRad / DEG).toBeCloseTo(97.401519, 4)
    expect(r!.periodS).toBeCloseTo(5676.978, 2)
    expect(r!.betaStarRad / DEG).toBeCloseTo(68.018674, 4)
    expect(r!.sunDeclRad / DEG).toBeCloseTo(23.43543, 4)
    expect(r!.betaRad / DEG).toBeCloseTo(59.163055, 4)
    expect(r!.eclipseS).toBeCloseTo(1359.19, 1)
    expect(r!.eclipseFraction).toBeCloseTo(1359.19 / 5676.978, 4)
  })

  it('500 km LTAN 18 near the March equinox: beta 82.84 deg, no eclipse', () => {
    const r = dawnDuskBeta({ altitudeM: 500_000, ltanHours: 18, date: new Date('2026-03-20T00:00:00Z') })
    expect(r!.betaRad / DEG).toBeCloseTo(82.83984, 4)
    expect(r!.eclipseS).toBe(0)
  })

  it('500 km LTAN 06 on 2026-12-21: beta -59.166 deg with eclipse', () => {
    const r = dawnDuskBeta({ altitudeM: 500_000, ltanHours: 6, date: new Date('2026-12-21T00:00:00Z') })
    expect(r!.betaRad / DEG).toBeCloseTo(-59.165674, 4)
    expect(r!.eclipseS).toBeCloseTo(1359.04, 1)
  })

  it('dawnDuskBetaJd agrees with the Date form', () => {
    const a = dawnDuskBeta({ altitudeM: 500_000, ltanHours: 18, date: new Date('2026-06-21T00:00:00Z') })
    const b = dawnDuskBetaJd({ altitudeM: 500_000, ltanHours: 18, jd: 2461212.5 })
    expect(b!.betaRad).toBeCloseTo(a!.betaRad, 12)
  })

  it('rejects bad inputs', () => {
    expect(dawnDuskBeta({ altitudeM: -1, ltanHours: 18, date: new Date() })).toBeNull()
    expect(dawnDuskBeta({ altitudeM: 500_000, ltanHours: 24, date: new Date() })).toBeNull()
    expect(dawnDuskBeta({ altitudeM: 500_000, ltanHours: 18, date: new Date('nope') })).toBeNull()
  })
})

describe('dawnDuskSeason', () => {
  it('500 km LTAN 18, 2026: 106 eclipse days from doy 120 to 225, longest 1359.19 s', () => {
    const s = dawnDuskSeason({ altitudeM: 500_000, ltanHours: 18, year: 2026 })
    expect(s).not.toBeNull()
    expect(s!.samples).toHaveLength(365)
    expect(s!.betaMinAbsRad / DEG).toBeCloseTo(59.1631, 3)
    expect(s!.betaMaxAbsRad / DEG).toBeCloseTo(89.9167, 3)
    expect(s!.eclipseDays).toBe(106)
    expect(s!.firstEclipseDoy).toBe(120)
    expect(s!.lastEclipseDoy).toBe(225)
    expect(s!.maxEclipseS).toBeCloseTo(1359.19, 1)
  })

  it('550 km LTAN 18, 2026: 100 eclipse days from doy 123 to 222, longest 1299.34 s', () => {
    const s = dawnDuskSeason({ altitudeM: 550_000, ltanHours: 18, year: 2026 })
    expect(s!.eclipseDays).toBe(100)
    expect(s!.firstEclipseDoy).toBe(123)
    expect(s!.lastEclipseDoy).toBe(222)
    expect(s!.maxEclipseS).toBeCloseTo(1299.34, 1)
  })

  it('500 km LTAN 06, 2026: the season straddles the December solstice', () => {
    const s = dawnDuskSeason({ altitudeM: 500_000, ltanHours: 6, year: 2026 })
    expect(s!.eclipseDays).toBe(100)
    expect(s!.firstEclipseDoy).toBe(1)
    expect(s!.lastEclipseDoy).toBe(365)
    expect(s!.maxEclipseS).toBeCloseTo(1359.20, 1)
  })

  it('rejects a non-integer year', () => {
    expect(dawnDuskSeason({ altitudeM: 500_000, ltanHours: 18, year: 2026.5 })).toBeNull()
  })
})
