import { groupQueryUrl, type CelestrakGroupId } from '@/lib/celestrak'

export type SceneId = 'stations' | 'gnss' | 'starlink' | 'weather-science'

export type Scene = {
  id: SceneId
  groups: readonly CelestrakGroupId[]
  titleKey: string
  blurbKey: string
}

export const ORBITAL_VIEW_PATH = '/tools/orbital-view'

/** Evergreen presets from docs/JPL_INTEGRATION_PLAN.md §E2; group ids are CelesTrak's own. */
export const SCENES: readonly Scene[] = [
  { id: 'stations', groups: ['stations'], titleKey: 'scenes.stations_title', blurbKey: 'scenes.stations_blurb' },
  {
    id: 'gnss',
    groups: ['gps', 'glonass', 'galileo', 'beidou'],
    titleKey: 'scenes.gnss_title',
    blurbKey: 'scenes.gnss_blurb',
  },
  { id: 'starlink', groups: ['starlink'], titleKey: 'scenes.starlink_title', blurbKey: 'scenes.starlink_blurb' },
  {
    id: 'weather-science',
    groups: ['weather', 'science'],
    titleKey: 'scenes.weather_science_title',
    blurbKey: 'scenes.weather_science_blurb',
  },
]

export function sceneHref(scene: Scene): string {
  return `${ORBITAL_VIEW_PATH}?groups=${scene.groups.join(',')}`
}

/** One CelesTrak GP citation per group, so the card links the exact element sets it loads. */
export function sceneCitations(scene: Scene): { group: CelestrakGroupId; url: string }[] {
  return scene.groups.map((group) => ({ group, url: groupQueryUrl(group) }))
}
