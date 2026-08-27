import { describe, expect, it } from 'vitest'
import { satoriSafeText } from './text'

describe('satoriSafeText', () => {
  it('maps phonetic subscripts used in Hohmann', () => {
    expect(satoriSafeText('|vₚ − v₁| + |v₂ − vₐ|')).toBe('|vp − v₁| + |v₂ − va|')
  })

  it('maps superscript plus/minus used in Lambert', () => {
    expect(satoriSafeText('v₁⁻, v₂⁺')).toBe('v₁-, v₂+')
  })

  it('strips combining dots', () => {
    expect(satoriSafeText('Ω\u0307 · Q\u0307')).toBe('Ω · Q')
  })
})
