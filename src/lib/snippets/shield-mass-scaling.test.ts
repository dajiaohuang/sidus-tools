import { describe, expect, it } from 'vitest'
import { shieldMassScaling } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { shieldMassScalingSnippets } from './tools/shield-mass-scaling'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('shield-mass-scaling snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(shieldMassScalingSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics on the 2 m cube', () => {
    const bag = { L: 2, W: 2, H: 2, t: 2e-3, rho: 2700, m_extra: 0, p_v: 5e4 }
    const env = evalJs(shieldMassScalingSnippets.code.javascript!, bag)
    const phys = shieldMassScaling({ length: bag.L, width: bag.W, height: bag.H, thickness: bag.t, density: bag.rho, extraArealMass: bag.m_extra, powerDensity: bag.p_v })!
    rel(env.A_s, phys.surfaceArea, 1e-12)
    rel(env.V, phys.volume, 1e-12)
    rel(env.rho_A, phys.arealDensity, 1e-12)
    rel(env.rho_A_gcm2, phys.arealDensityGcm2, 1e-12)
    rel(env.m_shield, phys.shieldMass, 1e-12)
    rel(env.P, phys.power, 1e-12)
    rel(env.kg_kw, phys.kgPerKw, 1e-12)
  })
})
