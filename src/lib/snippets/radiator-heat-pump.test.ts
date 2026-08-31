import { describe, expect, it } from 'vitest'
import { radiatorHeatPump } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { radiatorHeatPumpSnippets } from './tools/radiator-heat-pump'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('radiator-heat-pump snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(radiatorHeatPumpSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics on the ICES-2015-35 bag', () => {
    const phys = radiatorHeatPump({ q: 5000, tColdK: 318.15, tHotK: 373.15, cop: 2.3, emissivity: 0.85, sides: 1, qEnv: 150, pvPowerDensity: 270.468 })!
    const bag = { Q: 5000, T_c: 318.15, T_h: 373.15, eta_II: phys.carnotFraction, eps: 0.85, n_sides: 1, q_env: 150, T_base: 318.15, q_pv: 270.468 }
    const env = evalJs(radiatorHeatPumpSnippets.code.javascript!, bag)
    rel(env.COP_c, phys.copCarnot, 1e-12)
    rel(env.COP, phys.cop, 1e-12)
    rel(env.W, phys.work, 1e-12)
    rel(env.Q_rej, phys.qRej, 1e-12)
    rel(env.q_net_base, phys.qNetBase, 1e-12)
    rel(env.q_net_hp, phys.qNetHp, 1e-12)
    rel(env.A_base, phys.aBase!, 1e-12)
    rel(env.A_hp, phys.aHp!, 1e-12)
    rel(env.dA_pv, phys.extraPvArea!, 1e-12)
    rel(env.A_saved_net, phys.netAreaSaved!, 1e-12)
  })
})
