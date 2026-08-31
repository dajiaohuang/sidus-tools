import { describe, expect, it } from 'vitest'
import { dawnDuskBetaJd, EARTH_J2, EARTH_MU, EARTH_RADIUS, OMEGA_SUN } from '@/lib/physics'
import { extractAssignedNames } from '@/lib/snippets/live-values'
import { CODE_LANGS } from '@/lib/snippets/types'
import { ssoDawnDuskSnippets } from './tools/sso-dawn-dusk'

function evalJs(body: string, bindings: Record<string, number>): Record<string, number> {
  const names = extractAssignedNames(body, 'javascript')
  const fn = new Function(...Object.keys(bindings), `${body}\nreturn { ${names.join(', ')} };`)
  return fn(...Object.values(bindings)) as Record<string, number>
}

function rel(actual: number | null | undefined, expected: number, tol: number): void {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) / expected - 1), `${actual} vs ${expected}`).toBeLessThan(tol)
}

describe('sso-dawn-dusk snippet', () => {
  it('ships every language', () => {
    for (const { id } of CODE_LANGS) expect(ssoDawnDuskSnippets.code[id], id).toBeTruthy()
  })

  it('javascript body matches shipped physics on 2026-06-21, 500 km, LTAN 18', () => {
    const bag = { h: 500_000, ltan_h: 18, jd: 2461212.5, mu: EARTH_MU, R: EARTH_RADIUS, J2: EARTH_J2, omega_sun: OMEGA_SUN }
    const env = evalJs(ssoDawnDuskSnippets.code.javascript!, bag)
    const phys = dawnDuskBetaJd({ altitudeM: bag.h, ltanHours: bag.ltan_h, jd: bag.jd })!
    rel(env.i_sso, phys.inclRad, 1e-10)
    rel(env.T, phys.periodS, 1e-10)
    rel(env.decl, phys.sunDeclRad, 1e-9)
    rel(env.beta, phys.betaRad, 1e-9)
    rel(env.beta_star, phys.betaStarRad, 1e-12)
    rel(env.t_ecl, phys.eclipseS, 1e-8)
    rel(env.f_ecl, phys.eclipseFraction, 1e-8)
  })

  it('javascript body gives zero eclipse above beta*', () => {
    const env = evalJs(ssoDawnDuskSnippets.code.javascript!, { h: 500_000, ltan_h: 18, jd: 2461119.5, mu: EARTH_MU, R: EARTH_RADIUS, J2: EARTH_J2, omega_sun: OMEGA_SUN })
    expect(env.t_ecl).toBe(0)
  })
})
