// src/lib/snippets/cold-plate-dt.test.ts
import { describe, expect, it } from 'vitest'
import { coldPlateChain } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { coldPlateDtSnippets } from './tools/cold-plate-dt'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('cold-plate-dt snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(coldPlateDtSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics on the H100 bag', () => {
    const bag = { Q: 700, A_die: 814e-6, R_jc: 0.05, t_tim: 50e-6, k_tim: 5, A_tim: 814e-6, h: 3e4, A_wet: 814e-6, mdot: 0.05, cp: 4184, T_in: 293.15 }
    const env = evalJs(coldPlateDtSnippets.code.javascript!, bag)
    const phys = coldPlateChain({ q: bag.Q, dieArea: bag.A_die, rJc: bag.R_jc, timThickness: bag.t_tim, timK: bag.k_tim, timArea: bag.A_tim, hCoolant: bag.h, wettedArea: bag.A_wet, mdot: bag.mdot, cp: bag.cp, tInK: bag.T_in })!
    rel(env.q_flux, phys.heatFluxDie, 1e-12)
    rel(env.R_tim, phys.rTim, 1e-12)
    rel(env.R_conv, phys.rConv, 1e-12)
    rel(env.R_tot, phys.rTotal, 1e-12)
    rel(env.dT_fluid, phys.dTFluid, 1e-12)
    rel(env.T_case, phys.tCaseK, 1e-12)
    rel(env.T_j, phys.tJunctionK, 1e-12)
  })
})
