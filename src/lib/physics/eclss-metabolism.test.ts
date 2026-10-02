import { describe, expect, it } from 'vitest'
import { applyMetabolism, metabolicBudget } from './eclss'

describe('applyMetabolism oxygen feasibility', () => {
  it('rejects a duration that requires more oxygen than the cabin contains', () => {
    const masses = { o2: 0.01, n2: 1, co2: 0, h2o: 0 }

    expect(applyMetabolism(10, 293.15, masses, 'nominal', 3600, 1)).toBeNull()
    expect(masses).toEqual({ o2: 0.01, n2: 1, co2: 0, h2o: 0 })
  })

  it('allows an interval that ends exactly when the oxygen budget is exhausted', () => {
    const durationS = 3600
    const budget = metabolicBudget('nominal', durationS, 1)!
    const result = applyMetabolism(
      10,
      293.15,
      { o2: budget.o2Kg, n2: 1, co2: 0, h2o: 0 },
      'nominal',
      durationS,
      1,
    )

    expect(result?.masses.o2).toBe(0)
    expect(result?.masses.co2).toBeCloseTo(budget.co2Kg, 12)
    expect(result?.masses.h2o).toBeCloseTo(budget.h2oKg, 12)
  })
})
