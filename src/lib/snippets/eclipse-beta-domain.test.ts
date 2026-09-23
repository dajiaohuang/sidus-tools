import { describe, expect, it } from 'vitest'
import { ebSnippets } from './tools/eclipse-beta'
import { wrapAsRunnable } from './live-values'
import type { CodeLang } from './types'

const guardByLanguage: Record<CodeLang, string> = {
  python: 'if not (-math.pi / 2 <= betaRad <= math.pi / 2)',
  javascript: 'betaRad >= -Math.PI / 2 && betaRad <= Math.PI / 2',
  typescript: 'betaRad >= -Math.PI / 2 && betaRad <= Math.PI / 2',
  c: 'betaRad >= -M_PI / 2.0 && betaRad <= M_PI / 2.0',
  cpp: 'betaRad >= -M_PI / 2.0 && betaRad <= M_PI / 2.0',
  rust: 'std::f64::consts::FRAC_PI_2',
  zig: 'betaRad <= std.math.pi / 2.0',
  fortran: 'betaRad <= 1.57079632679489661923d0',
  matlab: 'betaRad <= pi/2',
  julia: '-pi / 2 <= betaRad',
  latex: '|\\beta| \\le \\pi/2',
}

describe('eclipse-beta snippet domain', () => {
  it('documents and checks the principal beta-angle domain in all exported languages', () => {
    expect(ebSnippets.assumptions).toContain('[-pi/2, pi/2]')
    for (const lang of Object.keys(guardByLanguage) as CodeLang[]) {
      const body = ebSnippets.code[lang]
      expect(body, lang).toContain(guardByLanguage[lang])
      if (lang !== 'latex') {
        expect(wrapAsRunnable(body, lang, { h: 400_000, betaRad: 0.3, mu: 3.986e14, R: 6_378_137 }), lang)
          .toContain(guardByLanguage[lang])
      }
    }
  })
})
