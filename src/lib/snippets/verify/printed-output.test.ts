import { describe, expect, it } from 'vitest'
import { parsePrinted } from '../../../../scripts/verify-snippets'

describe('snippet verifier printed output', () => {
  it('parses numeric assignments from LF and CRLF output identically', () => {
    const expected = new Map([
      ['T', 5553.6245624479825],
      ['frac', 0],
      ['t_ecl', 0],
    ])

    expect(parsePrinted('T = 5553.6245624479825\nfrac = 0\nt_ecl = 0\n')).toEqual(expected)
    expect(parsePrinted('T = 5553.6245624479825\r\nfrac = 0\r\nt_ecl = 0\r\n')).toEqual(expected)
  })

  it('parses CR-only line endings too', () => {
    expect(parsePrinted('x = 1\ry = 2\r')).toEqual(new Map([['x', 1], ['y', 2]]))
  })
})
