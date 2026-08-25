import { describe, expect, it } from 'vitest'
import { numParam, strParam } from './use-tool-search-params'

describe('param readers treat bogus literals as absent', () => {
  /**
   * A link written by an older or buggy build can carry `?alt=undefined`. It has
   * to open on the default, not on the string.
   */
  it.each(['undefined', 'null', 'NaN', ''])('strParam falls back for %o', (raw) => {
    expect(strParam('1', ['0', '1']).parse(raw)).toBe('1')
    // Without an allow-list there is nothing else to catch it.
    expect(strParam('sun').parse(raw)).toBe('sun')
  })

  it.each(['undefined', 'null', 'NaN', ''])('numParam falls back for %o', (raw) => {
    expect(numParam(400).parse(raw)).toBe(400)
  })

  it('still reads real values, including ones that look odd', () => {
    expect(strParam('sun').parse('sun,moon,mercury')).toBe('sun,moon,mercury')
    expect(strParam('globe', ['globe', 'solar']).parse('solar')).toBe('solar')
    expect(numParam(400).parse('0')).toBe(0)
    expect(numParam(400).parse('-12.5')).toBe(-12.5)
  })

  it('keeps the allow-list and the clamps working', () => {
    expect(strParam('globe', ['globe', 'solar']).parse('mars')).toBe('globe')
    expect(numParam(5, { min: 1, max: 10 }).parse('99')).toBe(10)
    expect(numParam(5, { min: 1, max: 10 }).parse('-99')).toBe(1)
    expect(numParam(5).parse('not-a-number')).toBe(5)
  })

  it('does not swallow a literal that is a legitimate value', () => {
    /*
     * "null" is only absent because no tool uses it as a value; if one did,
     * the allow-list would still be the thing that decides.
     */
    expect(strParam('none', ['none', 'sun']).parse('none')).toBe('none')
  })
})
