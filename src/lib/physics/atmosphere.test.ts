import { describe, expect, it } from 'vitest'
import { dynamicPressure, isaAtmosphere } from './atmosphere'

describe('geometric-altitude ISA conversion', () => {
  it('matches the 1976 standard profile at geometric 11 km', () => {
    const result = isaAtmosphere(11_000)!
    expect(result.h).toBe(11_000)
    expect(result.layer).toBe('troposphere')
    expect(result.T).toBeCloseTo(216.7735, 3)
    expect(result.p).toBeCloseTo(22_699.938, 0)
    expect(result.rho).toBeCloseTo(0.36480145, 6)
  })

  it('does not enter the 20 km geopotential layer until the matching geometric height', () => {
    const result = isaAtmosphere(20_000)!
    expect(result.layer).toBe('tropopause')
    expect(result.T).toBeCloseTo(216.65, 8)
    expect(result.p).toBeCloseTo(5_529.3015, 2)
    expect(result.rho).toBeCloseTo(0.08890981, 7)
  })

  it('matches the standard geometric 32 km upper boundary and dependent dynamic pressure', () => {
    const result = isaAtmosphere(32_000)!
    expect(result.h).toBe(32_000)
    expect(result.layer).toBe('stratosphere')
    expect(result.T).toBeCloseTo(228.489716, 5)
    expect(result.p).toBeCloseTo(889.061807, 3)
    expect(result.rho).toBeCloseTo(0.0135551211, 9)
    expect(dynamicPressure(result.rho, 300)).toBeCloseTo(609.98045, 2)
  })
})
