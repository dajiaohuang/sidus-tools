import { describe, expect, it } from 'vitest'
import { TWO_PHASE_FLUIDS, twoPhaseLoop } from './two-phase'

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('TWO_PHASE_FLUIDS', () => {
  it('stores NIST saturation rows (h_fg = h_V - h_L) in SI', () => {
    rel(TWO_PHASE_FLUIDS.ammonia.hfg, 1186.28e3, 1e-5)
    rel(TWO_PHASE_FLUIDS.water20.hfg, 2453.49e3, 1e-5)
    rel(TWO_PHASE_FLUIDS.water100.hfg, 2256.43e3, 1e-5)
    rel(TWO_PHASE_FLUIDS.co2.hfg, 152.0e3, 1e-5)
    rel(TWO_PHASE_FLUIDS.r134a.hfg, 182.28e3, 1e-5)
    expect(TWO_PHASE_FLUIDS.ammonia.rhoL).toBeCloseTo(610.39, 2)
    expect(TWO_PHASE_FLUIDS.ammonia.cpL).toBeCloseTo(4738.9, 1)
    expect(TWO_PHASE_FLUIDS.ammonia.pSat).toBeCloseTo(857.04e3, 0)
    expect(TWO_PHASE_FLUIDS.water100.tRefK).toBe(373.15)
  })
})

describe('twoPhaseLoop', () => {
  const NH3 = { q: 1e6, hfg: 1186.28e3, qualityChange: 1, cp: 4738.9, deltaT: 10, rhoL: 610.39, pressureDrop: 1e5, pumpEff: 0.5 }

  it('1 MW ammonia: 0.843 kg/s two-phase vs 21.10 kg/s single-phase, ratio 25.03', () => {
    const r = twoPhaseLoop(NH3)
    rel(r!.mdotTwoPhase, 0.842971, 1e-5)
    rel(r!.mdotSinglePhase, 21.10194, 1e-5)
    rel(r!.flowRatio, 25.03281, 1e-5)
    rel(r!.volFlowTwoPhase, 1.38104e-3, 1e-5)
    rel(r!.pumpPowerTwoPhase, 276.207, 1e-5)
    rel(r!.pumpPowerSinglePhase, 6914.25, 1e-5)
  })

  it('flow ratio identity: ratio x cp x dT / hfg = quality change', () => {
    const r = twoPhaseLoop({ ...NH3, qualityChange: 0.7 })!
    expect((r.flowRatio * NH3.cp * NH3.deltaT) / NH3.hfg).toBeCloseTo(0.7, 12)
  })

  it('water at 100 C, 100 kW, quality change 0.5', () => {
    const r = twoPhaseLoop({ q: 1e5, hfg: 2256.43e3, qualityChange: 0.5, cp: 4215.7, deltaT: 10, rhoL: 958.35, pressureDrop: 5e4, pumpEff: 0.6 })
    rel(r!.mdotTwoPhase, 0.088635, 1e-5)
  })

  it('rejects invalid inputs', () => {
    expect(twoPhaseLoop({ ...NH3, qualityChange: 0 })).toBeNull()
    expect(twoPhaseLoop({ ...NH3, qualityChange: 1.2 })).toBeNull()
    expect(twoPhaseLoop({ ...NH3, pumpEff: 0 })).toBeNull()
    expect(twoPhaseLoop({ ...NH3, deltaT: 0 })).toBeNull()
  })
})
