/**
 * The drawn prefix, which is the only part of the trajectory layer that can be
 * checked without a GL context.
 *
 * `setBatch` and `filled` touch no WebGL at all: they are bookkeeping over
 * which satellites have arrived, and getting that wrong is silent. A batch
 * dropped from the tally caps the drawn population there for the rest of the
 * session, and a batch counted twice draws slots that were never filled.
 */

import { describe, expect, it } from 'vitest'
import { createSwarmTrailLayer } from './swarm-trail-layer'
import { SWARM_TRAIL_FLOATS_PER_SATELLITE } from './swarm-trails'

const batchFor = (count: number) => new Float32Array(count * SWARM_TRAIL_FLOATS_PER_SATELLITE)

function layerOf(count: number) {
  const errors: string[] = []
  const layer = createSwarmTrailLayer({ onError: (label) => errors.push(label) })
  layer.reset(count)
  return { layer, errors }
}

describe('the drawn prefix', () => {
  it('survives a refresh landing exactly on the frontier', () => {
    /*
     * The identified satellite's one-trail refresh can arrive at the
     * convergence frontier BEFORE its own sequential batch. The refresh
     * advances the frontier by one, so the sequential batch then sits keyed
     * one behind it; only overlap-aware consumption lets the prefix advance
     * past it instead of freezing with every later batch queued forever.
     * This is that exact arrival order.
     */
    const { layer } = layerOf(2000)
    layer.setBatch(batchFor(360), 0, 360)
    layer.setBatch(batchFor(360), 360, 360)
    expect(layer.filled()).toBe(720)
    // The identified satellite is 720: its refresh lands first...
    layer.setBatch(batchFor(1), 720, 1)
    expect(layer.filled()).toBe(721)
    // ...then the sequential batch that STARTS at 720 arrives.
    layer.setBatch(batchFor(360), 720, 360)
    expect(layer.filled()).toBe(1080)
    layer.setBatch(batchFor(360), 1080, 360)
    expect(layer.filled()).toBe(1440)
  })

  it('drops stale entries that a wider batch already covered', () => {
    const { layer } = layerOf(2000)
    // An out-of-order refresh far ahead queues...
    layer.setBatch(batchFor(1), 500, 1)
    expect(layer.filled()).toBe(0)
    // ...and the sequential sweep swallows it without tripping over it.
    layer.setBatch(batchFor(360), 0, 360)
    layer.setBatch(batchFor(360), 360, 360)
    expect(layer.filled()).toBe(720)
    layer.setBatch(batchFor(360), 720, 360)
    expect(layer.filled()).toBe(1080)
  })

  it('starts empty and advances one batch at a time', () => {
    const { layer } = layerOf(1000)
    expect(layer.filled()).toBe(0)
    layer.setBatch(batchFor(360), 0, 360)
    expect(layer.filled()).toBe(360)
    layer.setBatch(batchFor(360), 360, 360)
    expect(layer.filled()).toBe(720)
    layer.setBatch(batchFor(280), 720, 280)
    expect(layer.filled()).toBe(1000)
  })

  it('waits for a batch that arrives out of turn rather than exposing the gap', () => {
    const { layer } = layerOf(1000)
    layer.setBatch(batchFor(360), 360, 360)
    expect(layer.filled()).toBe(0)
    layer.setBatch(batchFor(360), 0, 360)
    // Both are contiguous now, so the prefix jumps over the pair at once.
    expect(layer.filled()).toBe(720)
  })

  it('does not count a REFRESH of an already-drawn slot', () => {
    /*
     * The identified satellite's trajectory is re-produced every couple of
     * seconds. Those batches land inside the prefix and must change nothing:
     * counting one would advance the prefix over slots that never arrived, and
     * recording it would leave an entry the prefix loop can never consume.
     */
    const { layer } = layerOf(1000)
    layer.setBatch(batchFor(360), 0, 360)
    for (let i = 0; i < 50; i++) layer.setBatch(batchFor(1), 42, 1)
    expect(layer.filled()).toBe(360)
    layer.setBatch(batchFor(360), 360, 360)
    expect(layer.filled()).toBe(720)
  })

  it('still admits a single-satellite batch at the head of the gap', () => {
    // A refresh is "inside the prefix", not "small": a tail of one must land.
    const { layer } = layerOf(361)
    layer.setBatch(batchFor(360), 0, 360)
    layer.setBatch(batchFor(1), 360, 1)
    expect(layer.filled()).toBe(361)
  })

  it('refuses a batch that would run past the population', () => {
    const { layer } = layerOf(100)
    layer.setBatch(batchFor(360), 0, 360)
    expect(layer.filled()).toBe(0)
    layer.setBatch(batchFor(0), 0, 0)
    expect(layer.filled()).toBe(0)
  })

  it('empties on reset, so a new population cannot inherit the old prefix', () => {
    const { layer } = layerOf(1000)
    layer.setBatch(batchFor(360), 0, 360)
    layer.reset(500)
    expect(layer.filled()).toBe(0)
    layer.setBatch(batchFor(360), 0, 360)
    expect(layer.filled()).toBe(360)
  })
})
