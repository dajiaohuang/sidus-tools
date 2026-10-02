import { describe, expect, it } from 'vitest'
import { EARTH_MU } from './constants'
import { lambertSolve } from './lambert'
import type { Vec3 } from './vector'

type State6 = [number, number, number, number, number, number]

function integrateTwoBodyRK4(
  mu: number,
  r0: Vec3,
  v0: Vec3,
  tof: number,
  stepSeconds = 0.5,
): Vec3 {
  const steps = Math.ceil(tof / stepSeconds)
  const dt = tof / steps
  let y: State6 = [...r0, ...v0]

  const derivative = (state: State6): State6 => {
    const radius = Math.hypot(state[0], state[1], state[2])
    const accelerationScale = -mu / (radius * radius * radius)
    return [
      state[3],
      state[4],
      state[5],
      accelerationScale * state[0],
      accelerationScale * state[1],
      accelerationScale * state[2],
    ]
  }

  const offset = (state: State6, slope: State6, scale: number): State6 =>
    state.map((component, index) => component + scale * slope[index]) as State6

  for (let index = 0; index < steps; index++) {
    const k1 = derivative(y)
    const k2 = derivative(offset(y, k1, dt / 2))
    const k3 = derivative(offset(y, k2, dt / 2))
    const k4 = derivative(offset(y, k3, dt))
    y = y.map(
      (component, axis) =>
        component + (dt / 6) * (k1[axis] + 2 * k2[axis] + 2 * k3[axis] + k4[axis]),
    ) as State6
  }

  return [y[0], y[1], y[2]]
}

function positionMissRatio(actual: Vec3, target: Vec3): number {
  const targetRadius = Math.hypot(...target)
  return Math.hypot(
    actual[0] - target[0],
    actual[1] - target[1],
    actual[2] - target[2],
  ) / targetRadius
}

function expectReturnedSolutionMeetsBoundary(
  r1: Vec3,
  r2: Vec3,
  tof: number,
  shortWay: boolean,
): void {
  const solution = lambertSolve(EARTH_MU, r1, r2, tof, shortWay)
  if (!solution) return

  const endpoint = integrateTwoBodyRK4(EARTH_MU, r1, solution.v1, tof)
  expect(positionMissRatio(endpoint, r2)).toBeLessThan(1e-8)

  if (solution.a > 0) {
    const period = 2 * Math.PI * Math.sqrt(solution.a ** 3 / EARTH_MU)
    expect(tof).toBeLessThan(period)
  }
}

describe('Lambert boundary residuals', () => {
  it.each([
    { name: 'short-way', r2: [0, 8_000_000, 0] as Vec3, tof: 10_000, shortWay: true },
    { name: 'long-way', r2: [0, 7_000_000, 0] as Vec3, tof: 2_000, shortWay: false },
  ])('returns a valid $name transfer', ({ r2, tof, shortWay }) => {
    const r1: Vec3 = [7_000_000, 0, 0]
    const solution = lambertSolve(EARTH_MU, r1, r2, tof, shortWay)
    expect(solution).not.toBeNull()

    const endpoint = integrateTwoBodyRK4(EARTH_MU, r1, solution!.v1, tof)
    expect(positionMissRatio(endpoint, r2)).toBeLessThan(1e-8)
  })

  it('never returns the known non-convergent long-way candidate as a solution', () => {
    expectReturnedSolutionMeetsBoundary(
      [7_000_000, 0, 0],
      [0, 8_000_000, 0],
      10_000,
      false,
    )
  })

  it('never returns a multi-revolution root from the single-revolution solver', () => {
    expectReturnedSolutionMeetsBoundary(
      [7_000_000, 0, 0],
      [0, 8_000_000, 0],
      20_000,
      false,
    )
  })
})
