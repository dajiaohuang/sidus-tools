import { describe, expect, it } from 'vitest'
import {
  LIOH_THEORETICAL_CO2_CAPACITY,
  liohDuration,
  liohForCo2,
} from './eclss'

describe('LiOH stoichiometric CO₂ capacity limit', () => {
  it('derives the mass-ratio ceiling from 2 LiOH + CO₂ → Li₂CO₃ + H₂O', () => {
    expect(LIOH_THEORETICAL_CO2_CAPACITY).toBeCloseTo(0.918789, 6)
  })

  it('accepts the theoretical limit and the practical default', () => {
    expect(liohDuration(1, 1e-5, LIOH_THEORETICAL_CO2_CAPACITY)?.capacityKg)
      .toBeCloseTo(LIOH_THEORETICAL_CO2_CAPACITY, 12)
    expect(liohDuration(1, 1e-5)?.capacityKg).toBeCloseTo(0.85, 12)
    expect(liohForCo2(1, LIOH_THEORETICAL_CO2_CAPACITY))
      .toBeCloseTo(1 / LIOH_THEORETICAL_CO2_CAPACITY, 12)
  })

  it('rejects above-stoichiometric capacity in both sizing directions', () => {
    expect(liohDuration(1, 1e-5, 1)).toBeNull()
    expect(liohDuration(1, 1e-5, LIOH_THEORETICAL_CO2_CAPACITY + 1e-8)).toBeNull()
    expect(liohForCo2(1, 1)).toBeNull()
  })
})
