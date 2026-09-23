import { describe, expect, it } from 'vitest'
import {
  nadirPlateViewFactor,
  odcPowerThermalSizing,
  radiatorHeatPump,
  radiatorNetFlux,
} from './radiator'

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual, `expected ${expected}`).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

const WP = {
  tempK: 293.15,
  emissivity: 0.92,
  absorptivity: 0.09,
  sides: 2 as const,
  solarFlux: 1366,
  sunExposure: 1,
  viewFactor: 0.25,
  albedo: 0.3,
  earthTempK: 253.15,
}

describe('radiatorNetFlux', () => {
  it('reproduces the Starcloud 2024 worked example when alpha is applied to Earth IR', () => {
    const r = radiatorNetFlux({ ...WP, irAbsorptivity: 0.09, sigma: 5.67e-8 })
    expect(r).not.toBeNull()
    expect(r!.qEmit).toBeCloseTo(770.4784, 3)
    expect(r!.qSun).toBeCloseTo(122.94, 3)
    expect(r!.qAlbedo).toBeCloseTo(9.2205, 3)
    expect(r!.qIr).toBeCloseTo(5.2393, 3)
    expect(r!.qNet).toBeCloseTo(633.0786, 3)
    expect(r!.areaPerKw).toBeCloseTo(1.5796, 4)
  })

  it('applies epsilon to Earth IR by default (Kirchhoff) and gives 584.76 W/m2 for the same inputs', () => {
    const r = radiatorNetFlux({ ...WP, sigma: 5.67e-8 })
    expect(r!.qIr).toBeCloseTo(53.5578, 3)
    expect(r!.qNet).toBeCloseTo(584.7601, 3)
  })

  it('uses the repo Stefan-Boltzmann constant by default', () => {
    const r = radiatorNetFlux(WP)
    expect(r!.qNet).toBeCloseTo(584.8075, 3)
  })

  it('black two-sided plate at 20 C emits about 838 W/m2', () => {
    const r = radiatorNetFlux({ tempK: 293.15, emissivity: 1, absorptivity: 0, sides: 2, viewFactor: 0, sunExposure: 0 })
    expect(r!.qEmit).toBeCloseTo(837.53, 2)
    expect(r!.qNet).toBeCloseTo(837.53, 2)
  })

  it('matches the Turyshev emitted anchor 651 W/m2 (eps 0.90 x eta 0.85, 350 K, one face, no environment)', () => {
    const r = radiatorNetFlux({ tempK: 350, emissivity: 0.765, absorptivity: 0, sides: 1, viewFactor: 0, sunExposure: 0 })
    expect(r!.qEmit).toBeCloseTo(650.95, 2)
  })

  it('reports the sink-limited floor temperature where q_net = 0', () => {
    const r = radiatorNetFlux(WP)
    expect(r!.tFloorK).toBeCloseTo(205.40, 2)
    const atFloor = radiatorNetFlux({ ...WP, tempK: r!.tFloorK })
    expect(Math.abs(atFloor!.qNet)).toBeLessThan(1e-6)
  })

  it('returns null areaPerKw when the plate absorbs more than it emits', () => {
    const r = radiatorNetFlux({ ...WP, tempK: 150 })
    expect(r!.qNet).toBeLessThan(0)
    expect(r!.areaPerKw).toBeNull()
  })

  it('rejects invalid inputs', () => {
    expect(radiatorNetFlux({ ...WP, tempK: 0 })).toBeNull()
    expect(radiatorNetFlux({ ...WP, emissivity: 1.2 })).toBeNull()
    expect(radiatorNetFlux({ ...WP, absorptivity: -0.1 })).toBeNull()
    expect(radiatorNetFlux({ ...WP, viewFactor: 1.5 })).toBeNull()
    expect(radiatorNetFlux({ ...WP, sides: 3 as unknown as 2 })).toBeNull()
  })
})

describe('nadirPlateViewFactor', () => {
  it('is (R/(R+h))^2', () => {
    rel(nadirPlateViewFactor(500_000), 0.859896, 1e-6)
    rel(nadirPlateViewFactor(550_000), 0.847529, 1e-6)
    expect(nadirPlateViewFactor(-1)).toBeNull()
  })
})

describe('radiatorHeatPump', () => {
  const ICES = {
    q: 5000,
    tColdK: 318.15,
    tHotK: 373.15,
    cop: 2.3,
    emissivity: 0.85,
    sides: 1 as const,
    qEnv: 150,
    pvPowerDensity: 270.468,
  }

  it('reproduces ICES-2015-35 bookkeeping: 5 kW at COP 2.3 rejects 7.174 kW', () => {
    const r = radiatorHeatPump(ICES)
    expect(r).not.toBeNull()
    rel(r!.work, 2173.913, 1e-4)
    rel(r!.qRej, 7173.913, 1e-4)
    rel(r!.copCarnot, 5.78455, 1e-4)
    rel(r!.carnotFraction, 0.39761, 1e-4)
    rel(r!.qNetBase, 343.808, 1e-4)
    rel(r!.qNetHp, 784.468, 1e-4)
    rel(r!.aBase, 14.543, 1e-4)
    rel(r!.aHp, 9.1449, 1e-4)
    rel(r!.areaReduction, 0.37118, 1e-4)
    rel(r!.extraPvArea, 8.0376, 1e-4)
    rel(r!.netAreaSaved, 14.542988666 - 9.144940014 - 8.037597954, 1e-4)
    rel(r!.overhead, 1 / 2.3, 1e-9)
  })

  it('keeps the paper radiator fluxes inside the band for eps 0.8-0.9 and q_env 100-150', () => {
    for (const emissivity of [0.8, 0.9]) {
      for (const qEnv of [100, 150]) {
        const r = radiatorHeatPump({ ...ICES, emissivity, qEnv })!
        expect(r.qNetHp).toBeGreaterThan(729 - 0.5)
        expect(r.qNetHp).toBeLessThan(889 + 0.5)
        expect(r.qNetBase).toBeGreaterThan(315 - 0.5)
        expect(r.qNetBase).toBeLessThan(423 + 0.5)
      }
    }
  })

  it('derives COP from a Carnot fraction when cop is not given', () => {
    const r = radiatorHeatPump({ ...ICES, cop: undefined, carnotFraction: 0.4 })
    rel(r!.cop, 2.31382, 1e-5)
  })

  it('rejects direct COP above the Carnot limit but allows the reversible limit', () => {
    const copCarnot = ICES.tColdK / (ICES.tHotK - ICES.tColdK)
    const atLimit = radiatorHeatPump({ ...ICES, cop: copCarnot })
    expect(atLimit).not.toBeNull()
    rel(atLimit!.carnotFraction, 1, 1e-12)
    expect(radiatorHeatPump({ ...ICES, cop: copCarnot * (1 + 1e-12) })).toBeNull()
    expect(radiatorHeatPump({ ...ICES, cop: 8 })).toBeNull()
  })

  it('patent algebra: 10 kW at COP 1.85 rejects 15.405 kW', () => {
    const r = radiatorHeatPump({ q: 10_000, tColdK: 300, tHotK: 375, cop: 1.85, emissivity: 0.85 })
    rel(r!.qRej, 15405.4, 1e-5)
  })

  it('returns null areas when the radiator cannot reject at T_base', () => {
    const r = radiatorHeatPump({ ...ICES, tBaseK: 200, qEnv: 500 })
    expect(r!.aBase).toBeNull()
    expect(r!.areaSaved).toBeNull()
  })

  it('rejects T_h <= T_c and missing COP', () => {
    expect(radiatorHeatPump({ ...ICES, tHotK: 300 })).toBeNull()
    expect(radiatorHeatPump({ ...ICES, cop: undefined })).toBeNull()
  })
})

describe('odcPowerThermalSizing', () => {
  it('reproduces the white paper 5 GW array: about 4.3 km side and A_rad/A_pv 0.427', () => {
    const r = odcPowerThermalSizing({ pIt: 5e9, overhead: 1, solarFlux: 1366, cellEff: 0.22, fillFactor: 0.9, qNet: 633.078565 })
    rel(r!.aPv, 1.84865e7, 1e-5)
    rel(r!.pvSide, 4299.59, 1e-5)
    rel(r!.areaRatio, 0.427227, 1e-5)
    expect(r!.mPv).toBeNull()
    expect(r!.kgPerKwTotal).toBeNull()
  })

  it('reproduces the Turyshev 1 MW base case radiator: 2495 m2 and 12.5 kg/kW', () => {
    const sigma = 5.670374419e-8
    const qNet = 0.9 * 0.85 * sigma * 350 ** 4 - 150
    const r = odcPowerThermalSizing({ pIt: 1e6, overhead: 1.25, cellEff: 0.22, fillFactor: 0.9, qNet, radArealMass: 5 })
    rel(r!.aRad, 2495.28, 1e-4)
    rel(r!.mRad, 12476.4, 1e-4)
    rel(r!.kgPerKwRad, 12.4764, 1e-4)
    expect(Math.abs(r!.aRad / 2500 - 1)).toBeLessThan(0.005)
    rel(r!.kgPerKwTotal, 12.4764, 1e-4)
  })

  it('rejects non-positive power or net flux', () => {
    expect(odcPowerThermalSizing({ pIt: 0, cellEff: 0.22, fillFactor: 0.9, qNet: 600 })).toBeNull()
    expect(odcPowerThermalSizing({ pIt: 1e6, cellEff: 0.22, fillFactor: 0.9, qNet: 0 })).toBeNull()
  })
})
