import { describe, expect, it } from 'vitest'
import { isentropicNozzle } from './engines-ext'

describe('isentropic nozzle', () => {
  it('includes the pressure-thrust contribution in Cf', () => {
    const result = isentropicNozzle({ gamma: 1.2, peOverPc: 0.01 })
    expect(result).not.toBeNull()
    expect(result!.areaRatio).toBeCloseTo(11.8710430702, 9)
    expect(result!.cfIdeal).toBeCloseTo(1.7632317020, 9)
  })
})
