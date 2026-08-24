import { describe, expect, it } from 'vitest'
import { AU, EARTH_MU, SUN_MU } from '@/lib/physics'
import {
  bodyFactsAt,
  litFractionFromPhase,
  orbitalPeriodS,
  rotationPeriodS,
  visVivaSpeedMs,
} from './body-facts'

const DAY_S = 86_400
const YEAR_S = 365.25 * DAY_S
const DATE = new Date('2026-08-20T12:00:00Z')

describe('rotationPeriodS', () => {
  it('recovers the known sidereal days from the IAU prime-meridian rate', () => {
    // Earth: 360 / 360.9856235 deg per day = 23 h 56 m 4 s.
    expect(rotationPeriodS('earth')! / 3600).toBeCloseTo(23.9345, 3)
    // Jupiter is the fastest of the planets, under ten hours.
    expect(rotationPeriodS('jupiter')! / 3600).toBeCloseTo(9.925, 2)
    // Venus turns backwards and very slowly; the sign is dropped, the length is not.
    expect(rotationPeriodS('venus')! / DAY_S).toBeCloseTo(243.02, 1)
    // The Moon's rotation matches its orbit, which is why it keeps one face to us.
    expect(rotationPeriodS('moon')! / DAY_S).toBeCloseTo(27.32, 1)
  })
})

describe('orbitalPeriodS and visVivaSpeedMs', () => {
  it('gives Earth a year and 29.8 km/s at 1 au', () => {
    expect(orbitalPeriodS(AU, SUN_MU)! / YEAR_S).toBeCloseTo(1, 2)
    expect(visVivaSpeedMs(AU, AU, SUN_MU)! / 1000).toBeCloseTo(29.78, 1)
  })

  it('gives a low Earth orbit about 92 minutes and 7.7 km/s', () => {
    const r = 6_378_137 + 420_000
    expect(orbitalPeriodS(r, EARTH_MU)! / 60).toBeCloseTo(92.8, 0)
    expect(visVivaSpeedMs(r, r, EARTH_MU)! / 1000).toBeCloseTo(7.66, 1)
  })

  it('is faster at perihelion than at aphelion on the same orbit', () => {
    const a = AU
    expect(visVivaSpeedMs(0.98 * AU, a, SUN_MU)!).toBeGreaterThan(
      visVivaSpeedMs(1.02 * AU, a, SUN_MU)!,
    )
  })

  it('refuses degenerate inputs rather than returning a wrong number', () => {
    expect(orbitalPeriodS(0, SUN_MU)).toBeNull()
    expect(orbitalPeriodS(-1, SUN_MU)).toBeNull()
    expect(visVivaSpeedMs(0, AU, SUN_MU)).toBeNull()
  })
})

describe('litFractionFromPhase', () => {
  it('runs from full to new', () => {
    expect(litFractionFromPhase(0)).toBeCloseTo(1, 12)
    expect(litFractionFromPhase(Math.PI / 2)).toBeCloseTo(0.5, 12)
    expect(litFractionFromPhase(Math.PI)).toBeCloseTo(0, 12)
  })
})

describe('bodyFactsAt', () => {
  it('describes the Sun as a spinning body with no orbit of its own', () => {
    const facts = bodyFactsAt('sun', DATE)
    expect(facts.radiusM).toBeCloseTo(695_700_000, 0)
    expect(facts.primary).toBeNull()
    expect(facts.distanceM).toBeNull()
    expect(facts.orbitalPeriodS).toBeNull()
    expect(facts.rotationPeriodS! / DAY_S).toBeCloseTo(25.38, 1)
  })

  it('puts Earth at about 1 au on a nearly circular, nearly uninclined orbit', () => {
    const facts = bodyFactsAt('earth', DATE)
    expect(facts.primary).toBe('sun')
    expect(facts.distanceM! / AU).toBeGreaterThan(0.98)
    expect(facts.distanceM! / AU).toBeLessThan(1.02)
    expect(facts.orbitalPeriodS! / YEAR_S).toBeCloseTo(1, 2)
    expect(facts.speedMs! / 1000).toBeGreaterThan(29)
    expect(facts.speedMs! / 1000).toBeLessThan(31)
    expect(facts.eccentricity!).toBeLessThan(0.02)
    expect(Math.abs(facts.inclinationRad!) * (180 / Math.PI)).toBeLessThan(0.01)
  })

  it('gives Mars its real eccentricity and inclination, and a period near 687 days', () => {
    const facts = bodyFactsAt('mars', DATE)
    expect(facts.eccentricity!).toBeCloseTo(0.0934, 2)
    expect(facts.inclinationRad! * (180 / Math.PI)).toBeCloseTo(1.85, 1)
    expect(facts.orbitalPeriodS! / DAY_S).toBeCloseTo(687, -1)
  })

  it('reads the Moon off its own state vector: a month, a km/s, a real phase', () => {
    const facts = bodyFactsAt('moon', DATE)
    expect(facts.primary).toBe('earth')
    expect(facts.distanceM! / 1000).toBeGreaterThan(356_000)
    expect(facts.distanceM! / 1000).toBeLessThan(407_000)
    expect(facts.orbitalPeriodS! / DAY_S).toBeGreaterThan(25)
    expect(facts.orbitalPeriodS! / DAY_S).toBeLessThan(30)
    expect(facts.speedMs!).toBeGreaterThan(900)
    expect(facts.speedMs!).toBeLessThan(1100)
    expect(facts.eccentricity!).toBeGreaterThan(0)
    expect(facts.eccentricity!).toBeLessThan(0.1)
    expect(facts.inclinationRad! * (180 / Math.PI)).toBeGreaterThan(4)
    expect(facts.inclinationRad! * (180 / Math.PI)).toBeLessThan(6)
    expect(facts.litFraction!).toBeGreaterThanOrEqual(0)
    expect(facts.litFraction!).toBeLessThanOrEqual(1)
  })

  it('cycles the Moon through full and new over a synodic month', () => {
    const start = new Date('2026-01-01T00:00:00Z')
    let min = 1
    let max = 0
    for (let day = 0; day < 30; day++) {
      const f = bodyFactsAt('moon', new Date(start.getTime() + day * DAY_S * 1000))
      min = Math.min(min, f.litFraction!)
      max = Math.max(max, f.litFraction!)
    }
    expect(min).toBeLessThan(0.05)
    expect(max).toBeGreaterThan(0.95)
  })

  it('orders the planets by distance, as they are', () => {
    const distance = (id: Parameters<typeof bodyFactsAt>[0]) => bodyFactsAt(id, DATE).distanceM!
    const order = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const
    for (let i = 1; i < order.length; i++) {
      expect(distance(order[i])).toBeGreaterThan(distance(order[i - 1]))
    }
  })
})
