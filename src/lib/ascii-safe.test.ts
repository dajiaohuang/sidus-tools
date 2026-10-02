import { describe, expect, it } from 'vitest'
import { asciiSafe } from '../../scripts/ascii-safe'

describe('asciiSafe', () => {
  it('preserves eta domains and other scientific symbols in ASCII', () => {
    expect(asciiSafe('a = 2 η P A/(c m); 0 < η ≤ 1; ρ ≥ 0; Θ')).toBe(
      'a = 2 eta P A/(c m); 0 < eta <= 1; rho >= 0; Theta',
    )
  })
})
