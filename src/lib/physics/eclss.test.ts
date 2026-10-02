import { describe, expect, it } from 'vitest'
import { cabinFromMasses, cabinMassesFromComposition } from './eclss'

describe('cabinMassesFromComposition', () => {
  it('round-trips a valid composition to the requested total and constituent pressures', () => {
    const masses = cabinMassesFromComposition(100, 293.15, 101_325, 0.21, 400, 0.4)
    expect(masses).not.toBeNull()

    const atmosphere = cabinFromMasses(100, 293.15, masses!)
    const ppH2O = 0.4 * 610.94 * Math.exp((17.625 * 20) / (20 + 243.04))
    const pDry = 101_325 - 400 - ppH2O
    expect(atmosphere?.pTotalPa).toBeCloseTo(101_325, 8)
    expect(atmosphere?.ppO2Pa).toBeCloseTo(0.21 * pDry, 8)
    expect(atmosphere?.ppCO2Pa).toBeCloseTo(400, 8)
    expect(atmosphere?.ppN2Pa).toBeCloseTo(0.79 * pDry, 8)
    expect(atmosphere?.ppH2OPa).toBeCloseTo(ppH2O, 8)
  })

  it.each([
    ['CO2 pressure greater than total pressure', 100_000, 200_000, 0.21, 0.4],
    ['negative CO2 pressure', 100_000, -1, 0.21, 0.4],
    ['relative humidity above saturation', 100_000, 400, 0.21, 1.2],
    ['water vapor pressure greater than total pressure', 1_000, 0, 0.21, 1],
    ['combined CO2 and water vapor pressure greater than total', 3_000, 1_000, 0.21, 1],
    ['non-finite CO2 pressure', 100_000, Number.POSITIVE_INFINITY, 0.21, 0.4],
  ])('rejects %s', (_name, pressure, ppCO2, dryO2Frac, rh) => {
    expect(cabinMassesFromComposition(10, 293.15, pressure, dryO2Frac, ppCO2, rh)).toBeNull()
  })
})
