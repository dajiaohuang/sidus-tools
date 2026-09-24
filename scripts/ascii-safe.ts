/** Fold scientific Unicode into readable ASCII for plain-text catalog surfaces. */
export function asciiSafe(s: string): string {
  return s
    .replace(/\u2014|\u2013|\u2212/g, '-') // em/en/minus
    .replace(/\u2026/g, '...')
    .replace(/\u00d7/g, 'x')
    .replace(/\u00b7/g, '.')
    .replace(/\u2248/g, '~')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u00bd/g, '1/2')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b3/g, '3')
    .replace(/\u0307/g, '') // combining dot above (q̇)
    .replace(/\u0394|\u2206/g, 'delta') // Δ
    .replace(/\u03bc|\u00b5/g, 'mu') // μ µ
    .replace(/\u03c1/g, 'rho') // ρ
    .replace(/\u03bb/g, 'lambda') // λ
    .replace(/\u03b2/g, 'beta') // β
    .replace(/\u03b8/g, 'theta') // θ
    .replace(/\u03b4/g, 'delta') // δ
    .replace(/\u03c3/g, 'sigma') // σ
    .replace(/\u03c6|\u03d5/g, 'phi') // φ / ϕ
    .replace(/\u0393/g, 'Gamma') // Γ
    .replace(/\u03a9/g, 'Omega') // Ω
    .replace(/\u0398/g, 'Theta') // Θ
    .replace(/\u03b7/g, 'eta') // η
    .replace(/\u2264/g, '<=') // ≤
    .replace(/\u2265/g, '>=') // ≥
    .replace(/\u03bd/g, 'nu') // ν
    .replace(/\u03c9/g, 'omega') // ω
    .replace(/\u03b5/g, 'eps') // ε
    .replace(/\u03b1/g, 'alpha') // α
    .replace(/\u221e/g, 'inf') // ∞
    .replace(/\u221a/g, 'sqrt') // √
    .replace(/\u00b0/g, 'deg') // °
    .replace(/\u2092/g, '2') // ₂
    .replace(/\u2093/g, 'x')
    .replace(/\u2080/g, '0')
    .replace(/\u2081/g, '1')
    .replace(/\u2082/g, '2')
    .replace(/\u1d62/g, 'i')
    .replace(/\u1d63/g, 'r')
    .replace(/\u1d64/g, 'u')
    .replace(/\u1d65/g, 'v')
    .replace(/\u209a/g, 'p')
    .replace(/\u1d50/g, 'm') // ₘ
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '') // drop remaining non-ASCII
    .replace(/\s+/g, ' ')
    .trim()
}
