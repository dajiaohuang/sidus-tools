import { describe, expect, it } from 'vitest'
import { serializeCatalogTags } from './catalog-tags'
import { applyCatalogParamsPatch } from './catalog-search-params'

describe('applyCatalogParamsPatch', () => {
  it('keeps a trailing space in q', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams(''), { q: 'hohmann ' })
    expect(next.get('q')).toBe('hohmann ')
  })

  it('keeps inner spaces in q', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams(''), { q: 'hohmann transfer' })
    expect(next.get('q')).toBe('hohmann transfer')
  })

  it('drops a blank (whitespace-only) query', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('q=old'), { q: '   ' })
    expect(next.get('q')).toBeNull()
  })

  it('drops an empty query', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('q=old'), { q: '' })
    expect(next.get('q')).toBeNull()
  })

  it('leaves untouched keys alone', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('q=x&tags=orbital'), { q: 'y' })
    expect(next.get('q')).toBe('y')
    expect(next.get('tags')).toBe('orbital')
  })

  it('sets tags via serializeCatalogTags', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams(''), {
      tags: ['orbital', 'crew'],
    })
    expect(next.get('tags')).toBe(serializeCatalogTags(['orbital', 'crew']))
  })

  it('deletes tags when patched with an empty array', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('tags=orbital'), { tags: [] })
    expect(next.get('tags')).toBeNull()
  })

  it('deletes tags when patched with null', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('tags=orbital'), { tags: null })
    expect(next.get('tags')).toBeNull()
  })

  it('always removes legacy tag= and cat= keys', () => {
    const next = applyCatalogParamsPatch(new URLSearchParams('tag=orbital&cat=crew&q=a'), {})
    expect(next.has('tag')).toBe(false)
    expect(next.has('cat')).toBe(false)
    expect(next.get('q')).toBe('a')
  })

  it('does not mutate the previous URLSearchParams', () => {
    const prev = new URLSearchParams('q=x')
    applyCatalogParamsPatch(prev, { q: 'y' })
    expect(prev.get('q')).toBe('x')
  })
})
