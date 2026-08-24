/**
 * Batch SGP4 propagation, off the main thread.
 *
 * The worker owns nothing but numbers: it parses element sets, evaluates SGP4,
 * and posts back one packed Float32Array whose buffer is TRANSFERRED, so the
 * hand-off is a pointer move rather than a copy. Nothing is drawn here and no
 * canvas is involved. The propagation itself lives in swarmProduction.ts, which
 * keeps it runnable outside a worker and therefore testable against the kind of
 * catalogue a real download contains.
 *
 * Every message handler is wrapped: a batch that fails must still ANSWER, or
 * the main thread's chain stops asking. The keyframe cadence is driven by
 * replies, so a silent handler is a permanently frozen swarm rather than one
 * missed frame. That is the difference between a satellite being skipped and
 * the whole population standing still.
 *
 * Two platform decisions are baked into that shape, and both are deliberate:
 *
 * - No SharedArrayBuffer. Safari only exposes it under cross-origin isolation
 *   (COOP + COEP), and it has no `credentialless` COEP, so isolating this page
 *   would require CORP headers on every cross-origin resource it loads, the
 *   OpenFreeMap tiles and CelesTrak among them. Transferable ArrayBuffers are
 *   universally supported and cost nothing here: the buffer is written once per
 *   keyframe and read once.
 *
 * - No OffscreenCanvas. Rendering stays in the MapLibre custom layer on the
 *   main thread, so the worker never needs one. Worth stating because reaching
 *   for it is the obvious instinct: WebGL in a worker only arrived in Safari 17
 *   (macOS Sonoma / iOS 17), and 16.4 builds expose OffscreenCanvas for 2D
 *   while silently lacking the WebGL context, which shows up as a quiet
 *   main-thread fallback on iPhones rather than as an error.
 */

import type { SatRec } from 'satellite.js'
import {
  SWARM_FLOATS_PER_SATELLITE,
  type SwarmRequest,
  type SwarmResponse,
} from '@/components/viz/globe/swarm'
import { SWARM_TRAIL_FLOATS_PER_SATELLITE } from '@/components/viz/globe/swarm-trails'
import { loadSwarmSatrecs, produceKeyframe, produceTrailBatch } from './swarm-production'

let satrecs: SatRec[] = []
/** Each satellite's own colour, in satrec order. */
let colors: [number, number, number][] = []
/** Trail reach either side of now, from the caller's count rule. */
let trailRevolutions = 0.5
/** Reused across keyframes: allocating 10k * 6 floats every two seconds would churn. */
let packed = new Float32Array(0)
/** Packed slot to satrec index, so a skipped satellite cannot shift the rest. */
let indices = new Uint32Array(0)
/** Reused across trail batches, sized for the largest batch asked for so far. */
let trailPacked = new Float32Array(0)

function post(message: SwarmResponse, transfer?: Transferable[]): void {
  ;(self as unknown as Worker).postMessage(message, transfer ?? [])
}

function handle(request: SwarmRequest): void {
  if (request.type === 'load') {
    const result = loadSwarmSatrecs(request.tles)
    satrecs = result.satrecs
    colors = result.colors
    trailRevolutions = request.trailRevolutions
    const needed = satrecs.length * SWARM_FLOATS_PER_SATELLITE
    if (packed.length < needed) packed = new Float32Array(needed)
    if (indices.length < satrecs.length) indices = new Uint32Array(satrecs.length)
    post({
      type: 'loaded',
      count: satrecs.length,
      accepted: result.accepted,
      rejected: result.rejected,
    })
    return
  }

  if (request.type === 'stop') {
    satrecs = []
    colors = []
    packed = new Float32Array(0)
    indices = new Uint32Array(0)
    trailPacked = new Float32Array(0)
    return
  }

  if (request.type === 'trails') {
    const start = Math.max(0, Math.min(request.startIndex, satrecs.length))
    const count = Math.max(0, Math.min(request.count, satrecs.length - start))
    const needed = count * SWARM_TRAIL_FLOATS_PER_SATELLITE
    if (trailPacked.length < needed) trailPacked = new Float32Array(needed)
    trailPacked.fill(0, 0, needed)
    const { skipped } = produceTrailBatch(
      satrecs,
      colors,
      start,
      count,
      request.atMs,
      trailRevolutions,
      trailPacked,
    )
    const slice = trailPacked.slice(0, needed)
    post(
      { type: 'trailBatch', startIndex: start, count, skipped, packed: slice, refresh: request.refresh },
      [slice.buffer],
    )
    return
  }

  if (request.type === 'produce') {
    const result = produceKeyframe(
      satrecs,
      colors,
      request.epochMs,
      request.spanMs,
      packed,
      indices,
    )
    const slice = packed.slice(0, result.count * SWARM_FLOATS_PER_SATELLITE)
    const slots = indices.slice(0, result.count)
    post(
      {
        type: 'keyframe',
        epochMs: request.epochMs,
        spanMs: request.spanMs,
        count: result.count,
        skipped: result.skipped,
        packed: slice,
        indices: slots,
      },
      [slice.buffer, slots.buffer],
    )
  }
}

self.onmessage = (event: MessageEvent<SwarmRequest>) => {
  const request = event.data
  try {
    handle(request)
  } catch (error) {
    /* The chain is reply-driven, so failing quietly would freeze the swarm for
       good. An empty answer of the right shape keeps it turning, and the
       message says which request could not be served. */
    const detail = error instanceof Error ? error.message : String(error)
    if (request.type === 'produce') {
      const empty = new Float32Array(0)
      const slots = new Uint32Array(0)
      post(
        {
          type: 'keyframe',
          epochMs: request.epochMs,
          spanMs: request.spanMs,
          count: 0,
          skipped: satrecs.length,
          packed: empty,
          indices: slots,
          error: detail,
        },
        [empty.buffer, slots.buffer],
      )
    } else if (request.type === 'trails') {
      const empty = new Float32Array(0)
      post(
        {
          type: 'trailBatch',
          startIndex: request.startIndex,
          count: 0,
          skipped: request.count,
          packed: empty,
          refresh: request.refresh,
          error: detail,
        },
        [empty.buffer],
      )
    } else if (request.type === 'load') {
      post({ type: 'loaded', count: 0, accepted: [], rejected: [], error: detail })
    }
  }
}
