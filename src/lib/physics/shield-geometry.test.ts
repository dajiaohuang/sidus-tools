import { describe, expect, it } from 'vitest'
import { shieldKgPerKwVsSize, shieldMassScaling } from './shield-geometry'

describe('shieldMassScaling', () => {
  const CUBE2 = { length: 2, width: 2, height: 2, thickness: 2e-3, density: 2700, powerDensity: 5e4 }

  it('2 m cube, 2 mm Al, 50 kW/m3: 24 m2, 5.4 kg/m2 (0.54 g/cm2), 129.6 kg, 0.324 kg/kW', () => {
    const r = shieldMassScaling(CUBE2)!
    expect(r.surfaceArea).toBeCloseTo(24, 12)
    expect(r.volume).toBeCloseTo(8, 12)
    expect(r.arealDensity).toBeCloseTo(5.4, 12)
    expect(r.arealDensityGcm2).toBeCloseTo(0.54, 12)
    expect(r.shieldMass).toBeCloseTo(129.6, 9)
    expect(r.power).toBeCloseTo(4e5, 6)
    expect(r.kgPerKw).toBeCloseTo(0.324, 12)
  })

  it('doubling the cube side halves kg/kW', () => {
    const r2 = shieldMassScaling(CUBE2)!
    const r4 = shieldMassScaling({ ...CUBE2, length: 4, width: 4, height: 4 })!
    expect(r4.kgPerKw).toBeCloseTo(r2.kgPerKw / 2, 12)
  })

  it('ISO-like 12.2 x 2.44 x 2.6 m box has 135.664 m2 of surface', () => {
    const r = shieldMassScaling({ ...CUBE2, length: 12.2, width: 2.44, height: 2.6 })!
    expect(r.surfaceArea).toBeCloseTo(135.664, 3)
  })

  it('extra areal mass adds to the shield areal density', () => {
    const r = shieldMassScaling({ ...CUBE2, extraArealMass: 1.6 })!
    expect(r.arealDensity).toBeCloseTo(7.0, 12)
  })

  it('sweeps cube sides', () => {
    const rows = shieldKgPerKwVsSize(CUBE2, [1, 2, 4])
    expect(rows.map((r) => r.side)).toEqual([1, 2, 4])
    expect(rows[1].kgPerKw).toBeCloseTo(0.324, 12)
    expect(rows[0].kgPerKw).toBeCloseTo(0.648, 12)
  })

  it('rejects invalid inputs', () => {
    expect(shieldMassScaling({ ...CUBE2, thickness: 0 })).toBeNull()
    expect(shieldMassScaling({ ...CUBE2, powerDensity: 0 })).toBeNull()
    expect(shieldMassScaling({ ...CUBE2, extraArealMass: -1 })).toBeNull()
  })
})
