import { describe, expect, it } from 'vitest'
import { coldPlateChain } from './cold-plate'

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('coldPlateChain', () => {
  const H100 = { q: 700, dieArea: 814e-6, rJc: 0.05, timThickness: 50e-6, timK: 5, hCoolant: 3e4, mdot: 0.05, cp: 4184, tInK: 293.15 }

  it('700 W on 814 mm2: 86.0 W/cm2, R_tim 0.01229, R_conv 0.04095, T_j 367.09 K', () => {
    const r = coldPlateChain(H100)
    rel(r!.heatFluxDie, 859950.86, 1e-5)
    rel(r!.rTim, 0.0122850, 1e-5)
    rel(r!.rConv, 0.0409500, 1e-5)
    rel(r!.rTotal, 0.05 + 0.012285012 + 0.040950041, 1e-6)
    rel(r!.dTFluid, 3.34608, 1e-5)
    rel(r!.tJunctionK, 367.0876, 1e-5)
  })

  it('identity: T_j - T_in = dT_fluid / 2 + Q R_total', () => {
    const r = coldPlateChain(H100)!
    expect(r.tJunctionK - H100.tInK).toBeCloseTo(r.dTFluid / 2 + H100.q * r.rTotal, 9)
    expect(r.tCaseK).toBeCloseTo(r.tJunctionK - H100.q * H100.rJc, 9)
    expect(r.tWallK).toBeCloseTo(r.tCaseK - H100.q * r.rTim, 9)
  })

  it('defaults TIM and wetted areas to the die area and accepts overrides', () => {
    const a = coldPlateChain(H100)!
    const b = coldPlateChain({ ...H100, timArea: 814e-6, wettedArea: 814e-6 })!
    expect(b.tJunctionK).toBeCloseTo(a.tJunctionK, 12)
    const c = coldPlateChain({ ...H100, wettedArea: 4 * 814e-6 })!
    expect(c.rConv).toBeCloseTo(a.rConv / 4, 12)
  })

  it('rejects invalid inputs', () => {
    expect(coldPlateChain({ ...H100, q: 0 })).toBeNull()
    expect(coldPlateChain({ ...H100, rJc: -1 })).toBeNull()
    expect(coldPlateChain({ ...H100, hCoolant: 0 })).toBeNull()
    expect(coldPlateChain({ ...H100, mdot: 0 })).toBeNull()
  })
})
