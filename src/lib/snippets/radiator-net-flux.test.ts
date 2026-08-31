import { describe, expect, it } from 'vitest'
import { radiatorNetFlux } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { radiatorNetFluxSnippets } from './tools/radiator-net-flux'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('radiator-net-flux snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(radiatorNetFluxSnippets.code[id], id).toBeTruthy()
    expect(radiatorNetFluxSnippets.formulaId).toBe('radiator-net-flux')
  })

  it('javascript body matches shipped physics on the white paper bag', () => {
    const bag = { T: 293.15, eps: 0.92, alpha: 0.09, n_sides: 2, S: 1366, f_sun: 1, F: 0.25, albedo: 0.3, Te: 253.15, alpha_ir: 0.09 }
    const env = evalJs(radiatorNetFluxSnippets.code.javascript!, bag)
    const phys = radiatorNetFlux({ tempK: bag.T, emissivity: bag.eps, absorptivity: bag.alpha, sides: 2, solarFlux: bag.S, sunExposure: bag.f_sun, viewFactor: bag.F, albedo: bag.albedo, earthTempK: bag.Te, irAbsorptivity: bag.alpha_ir })!
    rel(env.q_emit, phys.qEmit, 1e-12)
    rel(env.q_sun, phys.qSun, 1e-12)
    rel(env.q_alb, phys.qAlbedo, 1e-12)
    rel(env.q_ir, phys.qIr, 1e-12)
    rel(env.q_net, phys.qNet, 1e-12)
    rel(env.m2_per_kw, phys.areaPerKw!, 1e-12)
  })
})
