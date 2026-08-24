import type { CelestrakGroupId } from '@/lib/celestrak'

/** One chosen satellite: what the panel shows and what the propagator needs. */
export type SelectedSatellite = {
  catnr: string
  name: string
  tle: string
  /**
   * How it got here. An individual search keeps its name and trail at every
   * scale; a group member is population, and thins out with the crowd.
   */
  source: 'search' | 'group'
  group?: CelestrakGroupId
}
