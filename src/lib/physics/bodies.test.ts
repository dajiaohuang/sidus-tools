import { describe, expect, it } from 'vitest'
import { getBody } from './bodies'

describe('planetary gravitational parameters', () => {
  it('uses JPL primary-body GMs for Jupiter, Saturn, and Uranus', () => {
    expect(getBody('jupiter').mu).toBe(1.266865319e17)
    expect(getBody('saturn').mu).toBe(3.793120623e16)
    expect(getBody('uranus').mu).toBe(5.7939513e15)
  })
})
