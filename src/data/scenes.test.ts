import { describe, expect, it } from 'vitest'
import { CELESTRAK_GROUPS, parseGroupIds } from '@/lib/celestrak'
import { SCENES, sceneCitations, sceneHref } from './scenes'

describe('SCENES', () => {
  it('has unique ids', () => {
    const ids = SCENES.map((scene) => scene.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only uses group ids that are keys of CELESTRAK_GROUPS', () => {
    for (const scene of SCENES) {
      for (const group of scene.groups) {
        expect(group in CELESTRAK_GROUPS).toBe(true)
      }
    }
  })

  it('round-trips through the swarm parser via sceneHref', () => {
    for (const scene of SCENES) {
      const url = new URL(sceneHref(scene), 'https://sidus.tools')
      const parsed = parseGroupIds(url.searchParams.get('groups') ?? '')
      expect(parsed).toEqual([...scene.groups])
    }
  })

  it('cites the exact CelesTrak GP URL for every group', () => {
    for (const scene of SCENES) {
      for (const { group, url } of sceneCitations(scene)) {
        expect(url.startsWith('https://celestrak.org/')).toBe(true)
        expect(url).toContain(`GROUP=${CELESTRAK_GROUPS[group]}`)
      }
    }
  })

  it('never carries a sats= parameter, so the bundled ISS default stays', () => {
    for (const scene of SCENES) {
      expect(sceneHref(scene)).not.toContain('sats=')
    }
  })
})
