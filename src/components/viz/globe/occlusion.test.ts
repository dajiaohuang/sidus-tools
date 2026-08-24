import { describe, expect, it } from 'vitest'
import { isPointOccludedByGlobe } from './occlusion'

/** Camera on +Z at three radii, the same geometry the synthetic-camera tests use. */
const PLANE: [number, number, number, number] = [0, 0, 1, -1 / 3]

describe('isPointOccludedByGlobe', () => {
  it('keeps a high ring visible BESIDE the planet', () => {
    /*
     * A GEO-class vertex at 6.6 radii sits behind the plane through the
     * planet's silhouette (z < 1/3) yet far off the disc: the camera sees it
     * in plain sight past the limb. A horizon-plane shortcut discards it,
     * which is the case that separates the ray test from the plane test.
     */
    expect(isPointOccludedByGlobe([6.6, 0, -1], PLANE)).toBe(false)
    expect(isPointOccludedByGlobe([0, 6.6, -2], PLANE)).toBe(false)
  })

  it('hides what the planet actually covers', () => {
    // The antipodal ground point, straight behind the disc.
    expect(isPointOccludedByGlobe([0, 0, -1], PLANE)).toBe(true)
    // A low-orbit point in the shadow cone behind the planet.
    expect(isPointOccludedByGlobe([0.1, 0, -1.05], PLANE)).toBe(true)
  })

  it('shows the near side and hides the interior', () => {
    expect(isPointOccludedByGlobe([0, 0, 1], PLANE)).toBe(false) // sub-camera point
    /* An interior sample, as the axis chain produces: the ray enters the
       surface before reaching it, so a solid planet hides it. */
    expect(isPointOccludedByGlobe([0, 0, 0.2], PLANE)).toBe(true)
  })

  it('lets a satellite see over the horizon that hides the ground beneath it', () => {
    /*
     * The promise the swarm trails have always stated: slightly past the limb
     * a point at altitude is visible while its ground point is not.
     */
    /* Just past the horizon circle (which sits at z = 1/3 for a camera at
       three radii): the ground there is hidden, and the same bearing a tenth
       of a radius up clears the limb. Much further round, the planet's shadow
       cone widens faster than a tenth of a radius buys back, checked too,
       so the test states where seeing-over ends, not just that it exists. */
    const z = 0.2
    const x = Math.sqrt(1 - z * z)
    expect(isPointOccludedByGlobe([x, 0, z], PLANE)).toBe(true)
    expect(isPointOccludedByGlobe([x * 1.1, 0, z * 1.1], PLANE)).toBe(false)
    // Deep behind the planet, the same altitude no longer clears the shadow.
    expect(isPointOccludedByGlobe([Math.sqrt(1 - 0.15 * 0.15) * 1.1, 0, -0.165], PLANE)).toBe(true)
  })

  it('refuses to hide anything for a degenerate plane', () => {
    expect(isPointOccludedByGlobe([0, 0, -1], [0, 0, 0, 0])).toBe(false)
    expect(isPointOccludedByGlobe([0, 0, -1], [0, 0, 1, -2])).toBe(false) // camera below surface
  })
})
