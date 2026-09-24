import { describe, expect, it } from 'vitest'
import { freeVarsNeeded, renderLiveCode } from './live-values'
import { sgp4Snippets } from './sgp4'

const INPUTS = {
  at: '2000-06-27T18:50:19.733Z',
  tleLine1: '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  tleLine2: '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
}

describe('SGP4 code exports', () => {
  it.each(['javascript', 'typescript', 'python'] as const)(
    '%s consumes the live TLE and fixed UTC time without unbound inputs',
    (lang) => {
      const source = sgp4Snippets.code[lang]
      expect(source).toBeTruthy()

      const rendered = renderLiveCode(source!, lang, INPUTS)
      expect(rendered).toContain(INPUTS.tleLine1)
      expect(rendered).toContain(INPUTS.tleLine2)
      expect(rendered).toContain(INPUTS.at)
      expect(rendered).not.toContain('24100.50000000')
      expect(rendered).not.toMatch(/new Date\(\)|datetime\.now\(/)

      const unresolved = [...freeVarsNeeded(source!, lang)].filter((name) =>
        ['at', 'tleLine1', 'tleLine2'].includes(name),
      )
      expect(unresolved.sort()).toEqual(['at', 'tleLine1', 'tleLine2'])
    },
  )
})
