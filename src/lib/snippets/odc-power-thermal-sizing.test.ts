import { describe, expect, it } from 'vitest'
import { odcPowerThermalSizing } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { odcPowerThermalSizingSnippets } from './tools/odc-power-thermal-sizing'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('odc-power-thermal-sizing snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(odcPowerThermalSizingSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics on the white paper 5 GW bag', () => {
    const bag = { P_it: 5e9, a_oh: 1, S: 1366, eta_cell: 0.22, fill: 0.9, cos_th: 1, q_net: 633.078565, sigma_pv: 1, sigma_rad: 5 }
    const env = evalJs(odcPowerThermalSizingSnippets.code.javascript!, bag)
    const phys = odcPowerThermalSizing({ pIt: bag.P_it, overhead: bag.a_oh, solarFlux: bag.S, cellEff: bag.eta_cell, fillFactor: bag.fill, cosTheta: bag.cos_th, qNet: bag.q_net, pvArealMass: bag.sigma_pv, radArealMass: bag.sigma_rad })!
    rel(env.P_tot, phys.pTot, 1e-12)
    rel(env.q_pv, phys.pvPowerDensity, 1e-12)
    rel(env.A_pv, phys.aPv, 1e-12)
    rel(env.L_pv, phys.pvSide, 1e-12)
    rel(env.A_rad, phys.aRad, 1e-12)
    rel(env.ratio, phys.areaRatio, 1e-12)
    rel(env.M_pv, phys.mPv!, 1e-12)
    rel(env.M_rad, phys.mRad!, 1e-12)
    rel(env.kg_kw, phys.kgPerKwTotal!, 1e-12)
  })
})
