/**
 * MapLibre GL JS v6 loads its tile parser from a dedicated worker module.
 * Under Vite the worker must be registered once via `?worker&url` so the bundle
 * is self-contained (the dist worker imports a sibling shared chunk).
 *
 * @see https://maplibre.org/maplibre-gl-js/docs/
 */
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
