/**
 * Drives the SGP4 worker and hands the globe a keyframe to interpolate.
 *
 * The rhythm is: fetch a CelesTrak group once (cached for two hours), load it
 * into the worker once, then ask for one keyframe pair every couple of seconds.
 * Each answer arrives as a transferred ArrayBuffer, so nothing is copied and
 * nothing accumulates.
 *
 * The next pair is requested BEFORE the current one runs out, and its epoch is
 * the current one's end, so the two are contiguous and the swarm never pauses
 * at the seam. Arriving early is the normal case and it must NOT be shown
 * early: a keyframe whose epoch is still in the future interpolates at a
 * clamped progress of zero, which holds the whole swarm still at that
 * keyframe's start until the clock catches up. So an early answer is held and
 * PROMOTED AT ITS EPOCH, exactly where the running one ends. Promoting on
 * arrival instead measures as 34% of frames frozen, in 690 ms runs spaced 2 s
 * apart, every one of them on the early side of the clamp.
 *
 * A genuinely late answer is installed on arrival, and the clamp then does its
 * honest job of holding rather than extrapolating for the moment it is missing.
 *
 * The same worker also produces the population's TRAILS, one batch per keyframe
 * cycle. They are static for a given element set, so they are asked for once
 * and ride in the worker's idle time between keyframes rather than competing
 * with the positions, which is what lets ten thousand of them converge over
 * about a minute while the swarm keeps moving.
 *
 * Hidden tabs stop producing entirely. requestAnimationFrame already throttles
 * itself in the background, but the worker would happily keep propagating eight
 * thousand satellites for a tab nobody is looking at; on resume it asks for a
 * fresh keyframe at the current instant rather than continuing from a stale one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SWARM_KEYFRAME_MS,
  type SwarmRequest,
  type SwarmResponse,
  type SwarmTle,
} from '@/components/viz/globe/swarm'
import { SWARM_TRAIL_BATCH } from '@/components/viz/globe/swarm-trails'

/**
 * Fraction of a keyframe elapsed before the next one is asked for.
 *
 * Lead is free now that a keyframe is promoted at its epoch rather than on
 * arrival: an answer that comes back early simply waits, costing nothing. So
 * this buys the worker most of a span to produce in: at 0.3 the request goes
 * out 600 ms into a 2 s keyframe and has 1.4 s to come home, against 800 ms
 * at 0.6, so an answer that would land a frame past its epoch has room to
 * land before it.
 */
const REQUEST_AHEAD = 0.3

export type SwarmKeyframe = {
  packed: Float32Array
  count: number
  epochMs: number
  spanMs: number
  /** Packed slot to satrec index. Slot k is satrec k. */
  indices: Uint32Array
}

export type SwarmStatus = {
  loading: boolean
  /** Satellites the worker is propagating. */
  count: number
  /** Element sets the catalogue carried that could not be parsed. */
  rejected: number
  /** Satellites the last keyframe could not place. */
  skipped: number
  /** Catalogue numbers in satrec order, which IS the swarm's own index. */
  ids: string[]
  error: string
}

/**
 * One batch of finished trails. The array is handed straight to the layer, so
 * a batch is delivered once and never re-rendered: `version` is what changes.
 */
export type SwarmTrailBatch = {
  packed: Float32Array
  startIndex: number
  count: number
  /** True when this replaces a trail already drawn, rather than adding one. */
  refresh: boolean
  /** Bumped per batch, so an effect can depend on arrival rather than identity. */
  version: number
}

/**
 * `tles` null means no swarm at all: the worker is never created and nothing is
 * drawn. The caller decides when the population is big enough to be worth it.
 */
export function useSatelliteSwarm(
  tles: SwarmTle[] | null,
  trailRevolutions: number,
  /**
   * Catalogue number of the satellite whose trail is kept CURRENT, or null.
   *
   * The population's trails are produced once and then held, which is right
   * for a crowd and wrong for the one orbit somebody is looking at: the orbit
   * precesses out from under its own cached line by about 15 km an hour, which
   * is invisible at crowd zooms and is exactly what you see when you zoom in
   * on one satellite. Re-doing a single trail costs 0.3 ms, so the one being
   * attended to gets a fresh one every keyframe cycle and is never more than a
   * couple of seconds stale.
   *
   * A catalogue number rather than an index, because the worker's ordering is
   * the worker's business: it is established by which element sets parsed, it
   * is reported back through this same hook, and a caller that had to resolve
   * it would depend on the answer to ask the question.
   */
  refreshCatnr: string | null = null,
  /**
   * Whether the POPULATION's trails should be produced at all.
   *
   * The convergence costs the worker about a minute of batches for ten
   * thousand satellites, and in only-selected mode nothing ever draws them:
   * the identified satellite's trajectory comes from the full-treatment track,
   * not from this cache. Producing invisible geometry is not a warm-up, it is
   * waste, so the cursor simply does not advance while this is false, and
   * picks up from where it stood on the next keyframe after it turns true.
   */
  produceTrails: boolean = true,
  /**
   * Re-produce the population's trails after the first pass. Earth-fixed
   * tracks age, so the orbital-view crowd keeps looping. The home demo does
   * not: rewriting every trail every couple of seconds is a visible pop
   * against a slowly turning globe, and a 30-second watch does not notice
   * the kilometres of drift.
   */
  loopTrails: boolean = true,
  /**
   * True freezes Greenwich angle at the trail epoch so each trail is the
   * inertial ellipse (elevated globe). False is Earth-fixed, for ground tracks.
   */
  inertialTrails: boolean = false,
  /**
   * Greenwich freeze shared with the identified full-treatment track.
   *
   * The worker latches the first keyframe epoch when this is null. The
   * orbital view must pass the same latch it uses for `trackPointAt` and
   * `sampleInertialGeodeticTrack`, or hover promotes a Starlink off its
   * swarm path onto a trail converted at a different Earth orientation.
   */
  inertialFreezeMs: number | null = null,
): {
  keyframe: SwarmKeyframe | null
  status: SwarmStatus
  trailBatch: SwarmTrailBatch | null
  /** Satellites whose trail has been produced at least once. */
  trailsDone: number
} {
  const [status, setStatus] = useState<SwarmStatus>({
    loading: false,
    count: 0,
    rejected: 0,
    skipped: 0,
    ids: [],
    error: '',
  })
  /** Packed keyframes and trail batches stay in refs, not React state. */
  const keyframeRef = useRef<SwarmKeyframe | null>(null)
  const trailBatchRef = useRef<SwarmTrailBatch | null>(null)
  const [, setBinaryTick] = useState(0)
  const bumpBinary = () => setBinaryTick((n) => n + 1)
  /** Mirrors the cursor into React, for the panel's progress indicator. */
  const [trailsDone, setTrailsDone] = useState(0)
  /* Read through a ref so moving the pointer over the crowd cannot restart the
     worker: which satellite is fresh is not part of the population's identity. */
  const refreshRef = useRef(refreshCatnr)
  refreshRef.current = refreshCatnr
  /* Through a ref for the same reason as the others: flipping the trails
     switch must not restart the worker. */
  const produceTrailsRef = useRef(produceTrails)
  produceTrailsRef.current = produceTrails
  const loopTrailsRef = useRef(loopTrails)
  loopTrailsRef.current = loopTrails
  /** Catalogue number to worker index, so the refresh costs a lookup, not a scan. */
  const orderRef = useRef(new Map<string, number>())
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<number | null>(null)
  /** Promotion of a keyframe that arrived before its epoch. */
  const promoteRef = useRef<number | null>(null)
  /** End of the keyframe in flight, so the next one starts exactly there. */
  const nextEpochRef = useRef(0)
  /** Next satellite whose trail has not been produced yet. */
  const trailCursorRef = useRef(0)
  const trailVersionRef = useRef(0)
  /** Satellites the worker actually accepted, which bounds the trail cursor. */
  const loadedCountRef = useRef(0)
  /** Last reported skip count, so a steady state does not re-render every cycle. */
  const skippedRef = useRef(0)
  /* Read through a ref so a changed trail length does not restart the worker
     mid-flight; the signature below decides when a reload is actually due. */
  const revolutionsRef = useRef(trailRevolutions)
  revolutionsRef.current = trailRevolutions
  const inertialTrailsRef = useRef(inertialTrails)
  inertialTrailsRef.current = inertialTrails
  const inertialFreezeMsRef = useRef(inertialFreezeMs)
  inertialFreezeMsRef.current = inertialFreezeMs

  const request = useCallback((message: SwarmRequest) => {
    workerRef.current?.postMessage(message)
  }, [])

  const inertialFieldsOf = useCallback((): { inertial?: boolean; freezeMs?: number } => {
    const inertial = inertialTrailsRef.current
    if (!inertial) return { inertial: false }
    return {
      inertial: true,
      freezeMs: inertialFreezeMsRef.current ?? undefined,
    }
  }, [])

  const scheduleNext = useCallback(
    (fromMs: number) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (document.visibilityState === 'hidden') return
        request({
          type: 'produce',
          epochMs: nextEpochRef.current,
          spanMs: SWARM_KEYFRAME_MS,
          ...inertialFieldsOf(),
        })
      }, Math.max(0, fromMs))
    },
    [request, inertialFieldsOf],
  )

  /* The identity of the population, not its array: re-running on every render
     would restart the worker constantly. */
  /* The identity of the population AND of how it is to be drawn: a changed
     trail length or a recoloured list has to reach the worker, and both are
     decided by the count, so they belong in the same key. */
  const signature = useMemo(() => {
    if (tles === null) return null
    return `${tles.length}:${trailRevolutions}:${inertialTrails ? 1 : 0}:${tles.map((t) => `${t.catnr}@${t.rgb.join('/')}`).join(',')}`
  }, [tles, trailRevolutions, inertialTrails])

  useEffect(() => {
    if (tles === null || tles.length === 0) {
      keyframeRef.current = null
      trailBatchRef.current = null
      bumpBinary()
      setTrailsDone(0)
      setStatus({ loading: false, count: 0, rejected: 0, skipped: 0, ids: [], error: '' })
      return
    }
    let cancelled = false
    setStatus({ loading: true, count: 0, rejected: 0, skipped: 0, ids: [], error: '' })

    const worker = new Worker(new URL('../workers/sgp4-swarm.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<SwarmResponse>) => {
      if (cancelled) return
      const message = event.data
      if (message.type === 'loaded') {
        setStatus({
          loading: false,
          count: message.count,
          rejected: message.rejected.length,
          skipped: 0,
          ids: message.accepted,
          error: message.error ?? '',
        })
        trailCursorRef.current = 0
        loadedCountRef.current = message.count
        setTrailsDone(0)
        orderRef.current = new Map(message.accepted.map((catnr, at) => [catnr, at]))
        if (message.count === 0) return
        nextEpochRef.current = Date.now()
        request({
          type: 'produce',
          epochMs: nextEpochRef.current,
          spanMs: SWARM_KEYFRAME_MS,
          ...inertialFieldsOf(),
        })
        return
      }
      if (message.type === 'trailBatch') {
        trailVersionRef.current += 1
        trailBatchRef.current = {
          packed: message.packed,
          startIndex: message.startIndex,
          count: message.count,
          refresh: message.refresh === true,
          version: trailVersionRef.current,
        }
        bumpBinary()
        /* Progress is MONOTONE: the looping cursor wraps to zero every cycle,
           and letting it drag the counter back down would re-show the loading
           hairline forever on a population that finished loading long ago. */
        if (!message.refresh) {
          setTrailsDone((done) => Math.max(done, message.startIndex + message.count))
        }
        return
      }
      /* Reported so the panel can say what the catalogue cost, and so a
         population that suddenly stops placing is visible rather than silent. */
      if (message.skipped !== skippedRef.current) {
        skippedRef.current = message.skipped
        setStatus((current) => ({ ...current, skipped: message.skipped }))
      }
      const arrived: SwarmKeyframe = {
        packed: message.packed,
        count: message.count,
        epochMs: message.epochMs,
        spanMs: message.spanMs,
        indices: message.indices,
      }
      /* Show it when it starts, not when it lands. */
      if (promoteRef.current !== null) window.clearTimeout(promoteRef.current)
      const untilEpochMs = message.epochMs - Date.now()
      if (untilEpochMs <= 0) {
        promoteRef.current = null
        keyframeRef.current = arrived
        bumpBinary()
      } else {
        promoteRef.current = window.setTimeout(() => {
          promoteRef.current = null
          keyframeRef.current = arrived
          bumpBinary()
        }, untilEpochMs)
      }
      nextEpochRef.current = message.epochMs + message.spanMs
      /* Ask early enough that the answer is home before the current pair ends. */
      const dueInMs = message.epochMs + message.spanMs * REQUEST_AHEAD - Date.now()
      scheduleNext(dueInMs)

      /* Trails ride the keyframe cycle, one batch per span, produced in the
         worker's own idle time between keyframes. The population converges in
         about a minute and appears progressively while it does, and a batch
         can never delay a keyframe: the keyframe request is already scheduled
         above and the worker takes it next. */
      if (produceTrailsRef.current && loadedCountRef.current > 0) {
        /* Trails are Earth-fixed ground tracks: a produced-once cache ages as
           the satellite flies on. The orbital-view crowd wraps the cursor so
           every trail is re-made about once a minute. The home demo does not
           wrap: a full rewrite every keyframe is a pop, and a short watch
           does not see the drift. */
        let cursor = trailCursorRef.current
        if (cursor >= loadedCountRef.current) {
          if (!loopTrailsRef.current) cursor = loadedCountRef.current
          else cursor = 0
        }
        if (cursor < loadedCountRef.current) {
          const count = Math.min(SWARM_TRAIL_BATCH, loadedCountRef.current - cursor)
          trailCursorRef.current = cursor + count
          request({
            type: 'trails',
            startIndex: cursor,
            count,
            atMs: message.epochMs,
            ...inertialFieldsOf(),
          })
        }
      }

      /* And the one satellite being attended to, re-produced at THIS keyframe's
         epoch so its line is never stale enough to leave its own marker. One
         satellite against the batch's three hundred and sixty, so it rides
         along without competing with the population's convergence. */
      const fresh =
        produceTrailsRef.current && refreshRef.current !== null
          ? orderRef.current.get(refreshRef.current)
          : undefined
      if (fresh !== undefined && fresh < loadedCountRef.current) {
        request({
          type: 'trails',
          startIndex: fresh,
          count: 1,
          atMs: message.epochMs,
          refresh: true,
          ...inertialFieldsOf(),
        })
      }
    }

    request({ type: 'load', tles, trailRevolutions: revolutionsRef.current })

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = null
        if (promoteRef.current !== null) window.clearTimeout(promoteRef.current)
        promoteRef.current = null
        return
      }
      // Back in view: start again from now, not from wherever the clock left off.
      nextEpochRef.current = Date.now()
      request({
        type: 'produce',
        epochMs: nextEpochRef.current,
        spanMs: SWARM_KEYFRAME_MS,
        ...inertialFieldsOf(),
      })
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      if (promoteRef.current !== null) window.clearTimeout(promoteRef.current)
      promoteRef.current = null
      worker.postMessage({ type: 'stop' } satisfies SwarmRequest)
      worker.terminate()
      workerRef.current = null
      trailCursorRef.current = 0
      loadedCountRef.current = 0
      keyframeRef.current = null
      trailBatchRef.current = null
      bumpBinary()
      setTrailsDone(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature IS the identity of tles
  }, [signature, request, scheduleNext])

  /* Identified trail refresh. Skipped when population trails are off. */
  useEffect(() => {
    if (!produceTrails || refreshCatnr == null) return
    const at = orderRef.current.get(refreshCatnr)
    if (at === undefined || at >= loadedCountRef.current) return
    request({
      type: 'trails',
      startIndex: at,
      count: 1,
      atMs: Date.now(),
      refresh: true,
      ...inertialFieldsOf(),
    })
  }, [produceTrails, refreshCatnr, request, inertialFieldsOf])

  return {
    keyframe: keyframeRef.current,
    status,
    trailBatch: trailBatchRef.current,
    trailsDone,
  }
}
