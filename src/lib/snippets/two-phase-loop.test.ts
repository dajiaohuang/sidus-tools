import { describe, expect, it } from 'vitest'
import { twoPhaseLoop } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { twoPhaseLoopSnippets } from './tools/two-phase-loop'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('two-phase-loop snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(twoPhaseLoopSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics for 1 MW ammonia', () => {
    const bag = { Q: 1e6, h_fg: 1186.28e3, dx: 1, cp: 4738.9, dT: 10, rho_l: 610.39, dp: 1e5, eta_p: 0.5 }
    const env = evalJs(twoPhaseLoopSnippets.code.javascript!, bag)
    const phys = twoPhaseLoop({ q: bag.Q, hfg: bag.h_fg, qualityChange: bag.dx, cp: bag.cp, deltaT: bag.dT, rhoL: bag.rho_l, pressureDrop: bag.dp, pumpEff: bag.eta_p })!
    rel(env.mdot_2ph, phys.mdotTwoPhase, 1e-12)
    rel(env.mdot_1ph, phys.mdotSinglePhase, 1e-12)
    rel(env.flow_ratio, phys.flowRatio, 1e-12)
    rel(env.P_pump_2ph, phys.pumpPowerTwoPhase, 1e-12)
    rel(env.P_pump_1ph, phys.pumpPowerSinglePhase, 1e-12)
  })
})
