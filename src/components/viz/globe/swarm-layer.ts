/**
 * One draw call for the whole swarm.
 *
 * Every satellite is a point in a single interleaved buffer, and the GPU
 * interpolates each one between the two keyframe positions the worker packed
 * (see swarm.ts). One `gl.drawArrays(gl.POINTS, ...)` covers eight thousand
 * satellites, so the per-frame cost on the main thread is a uniform write and a
 * draw, not a loop.
 *
 * Every constraint the altitude layer established is honoured here, for the
 * same reasons it found them:
 *
 * - `precision mediump float;` is the FIRST statement of the fragment shader.
 *   Fragment shaders have no default float precision, and MapLibre injects no
 *   prelude into them, so anything ahead of that line leaves the program
 *   unlinked and every attribute location at -1: a layer that silently draws
 *   nothing.
 * - Shaders and attribute locations are cached PER VARIANT NAME. MapLibre hands
 *   a different prelude for globe and for mercator, so one compiled program
 *   cannot serve both.
 * - Elevation units are variant dependent: raw metres under globe, mercator
 *   units under mercator. The worker packs metres, so the mercator variant
 *   scales them with a uniform rather than repacking the buffer.
 * - All GL state is set inside render() and the attribute arrays are disabled
 *   again before returning, so nothing leaks into MapLibre's own draws.
 * - Buffers are allocated once and refilled with bufferSubData, so a keyframe
 *   every couple of seconds does not hand the collector a megabyte to clean up.
 */

import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl'
import { SWARM_FLOATS_PER_SATELLITE } from './swarm'
import { SPHERE_OCCLUSION_GLSL } from './occlusion'

export const SWARM_LAYER_ID = 'sidus-orbit-swarm'

/**
 * Frames kept by the timing trace when it is armed. Dev diagnosis only, and
 * sized so a 60 s acceptance window fits whole at 120 fps rather than the
 * trace quietly reporting only its own last seventeen seconds.
 */
const TRACE_MAX = 8000

export type SwarmTraceFrame = {
  tMs: number
  /** Progress BEFORE clamping: negative means the keyframe has not started. */
  raw: number
  progress: number
  epochMs: number
  spanMs: number
}

/**
 * Per-frame record of what the shader was actually told to interpolate.
 *
 * Null until something asks for it, so a normal session records nothing. The
 * unclamped `raw` is the point: a value outside [0, 1] is the swarm standing
 * still, and its sign says whether the keyframe is early or late.
 */
let trace: SwarmTraceFrame[] | null = null

export function armSwarmTrace(): void {
  if (!trace) trace = []
}

export function readSwarmTrace(): SwarmTraceFrame[] {
  return trace ? trace.slice() : []
}

type GlContext = WebGLRenderingContext | WebGL2RenderingContext

type ShaderEntry = {
  program: WebGLProgram
  aStart: number
  aDelta: number
  aRgb: number
  uProgress: WebGLUniformLocation | null
  uAlpha: WebGLUniformLocation | null
  uPointSize: WebGLUniformLocation | null
  uElevationScale: WebGLUniformLocation | null
  uHighlight: WebGLUniformLocation | null
}

export type SwarmLayer = CustomLayerInterface & {
  /** Hands the layer a packed keyframe. The array is kept, not copied. */
  setKeyframe(packed: Float32Array, count: number, epochMs: number, spanMs: number): void
  /** Point diameter in pixels, before the device pixel ratio. */
  setPointSize(px: number): void
  /** False draws the swarm on the surface, matching the altitude toggle. */
  setElevationEnabled(on: boolean): void
  /** Base alpha for every marker; each one's RGB rides in the buffer. */
  setAlpha(alpha: number): void
  /**
   * The PACKED SLOT of the marker drawn saturated and enlarged, or null. A
   * slot rather than a satellite index, because skipped satellites compact the
   * buffer and the shader only knows where a vertex sits in it.
   */
  setHighlightSlot(slot: number | null): void
  /** How many satellites the last keyframe carried. */
  count(): number
  isAttached(): boolean
}

export function createSwarmLayer(options: {
  onError: (label: string, error: unknown) => void
}): SwarmLayer {
  const { onError } = options
  const shaderMap = new Map<string, ShaderEntry>()

  let gl: GlContext | null = null
  let buffer: WebGLBuffer | null = null
  /** Bytes currently allocated on the GPU, so a growing swarm reallocates once. */
  let bufferBytes = 0
  let packed: Float32Array | null = null
  let count = 0
  let epochMs = 0
  let spanMs = 1
  let dirty = false
  let attached = false
  let pointSize = 3
  let elevationEnabled = true
  let alpha = 0.9
  let highlightSlot = -1

  function getShader(
    context: GlContext,
    shaderDescription: CustomRenderMethodInput['shaderData'],
  ): ShaderEntry {
    const cached = shaderMap.get(shaderDescription.variantName)
    if (cached) return cached

    /* The interpolation IS the vertex shader: start + progress * delta, one
       multiply-add per satellite per frame, and the wrap keeps a satellite
       crossing the antimeridian on the short way round. */
    const globeVariant = shaderDescription.variantName === 'globe'
    const vertexSource = `#version 300 es
    ${shaderDescription.vertexShaderPrelude}
    ${shaderDescription.define}
    ${globeVariant ? SPHERE_OCCLUSION_GLSL : ''}

    in vec3 a_start;
    in vec3 a_delta;
    in vec3 a_rgb;
    uniform float u_progress;
    uniform float u_point_size;
    uniform float u_elevation_scale;
    /* Index of the satellite drawn saturated and enlarged, or -1. */
    uniform float u_highlight;
    out vec3 v_rgb;
    out float v_highlight;

    void main() {
        vec3 here = a_start + u_progress * a_delta;
        vec2 pos = vec2(fract(here.x + 1.0), here.y);
        gl_Position = projectTileFor3D(pos, here.z * u_elevation_scale);
        ${
          globeVariant
            ? `gl_Position.z =
        sphereOcclusionClipZ(projectToSphere(pos) * (1.0 + here.z * u_elevation_scale / GLOBE_RADIUS)) *
        gl_Position.w;`
            : ''
        }
        v_highlight = abs(float(gl_VertexID) - u_highlight) < 0.5 ? 1.0 : 0.0;
        gl_PointSize = u_point_size * (1.0 + v_highlight * 0.8);
        v_rgb = a_rgb;
    }`

    const fragmentSource = `#version 300 es
    precision mediump float;
    in vec3 v_rgb;
    in float v_highlight;
    uniform float u_alpha;
    out highp vec4 fragColor;
    void main() {
        if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        fragColor = vec4(v_rgb, mix(u_alpha, 1.0, v_highlight));
    }`

    const vertexShader = context.createShader(context.VERTEX_SHADER)!
    context.shaderSource(vertexShader, vertexSource)
    context.compileShader(vertexShader)
    if (!context.getShaderParameter(vertexShader, context.COMPILE_STATUS)) {
      onError('Swarm vertex shader COMPILE FAILED', context.getShaderInfoLog(vertexShader) ?? '')
    }

    const fragmentShader = context.createShader(context.FRAGMENT_SHADER)!
    context.shaderSource(fragmentShader, fragmentSource)
    context.compileShader(fragmentShader)
    if (!context.getShaderParameter(fragmentShader, context.COMPILE_STATUS)) {
      onError('Swarm fragment shader COMPILE FAILED', context.getShaderInfoLog(fragmentShader) ?? '')
    }

    const program = context.createProgram()!
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      onError('Swarm program LINK FAILED', context.getProgramInfoLog(program) ?? '')
    }

    const entry: ShaderEntry = {
      program,
      aStart: context.getAttribLocation(program, 'a_start'),
      aDelta: context.getAttribLocation(program, 'a_delta'),
      aRgb: context.getAttribLocation(program, 'a_rgb'),
      uProgress: context.getUniformLocation(program, 'u_progress'),
      uAlpha: context.getUniformLocation(program, 'u_alpha'),
      uPointSize: context.getUniformLocation(program, 'u_point_size'),
      uElevationScale: context.getUniformLocation(program, 'u_elevation_scale'),
      uHighlight: context.getUniformLocation(program, 'u_highlight'),
    }
    shaderMap.set(shaderDescription.variantName, entry)
    return entry
  }

  return {
    id: SWARM_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(_map, context: GlContext) {
      gl = context
      attached = true
    },

    onRemove() {
      if (gl && buffer) gl.deleteBuffer(buffer)
      buffer = null
      bufferBytes = 0
      shaderMap.clear()
      attached = false
      gl = null
    },

    setKeyframe(next, nextCount, nextEpochMs, nextSpanMs) {
      packed = next
      count = nextCount
      epochMs = nextEpochMs
      spanMs = nextSpanMs
      dirty = true
    },

    setPointSize(px) {
      pointSize = px
    },

    setElevationEnabled(on) {
      elevationEnabled = on
    },

    setAlpha(next) {
      alpha = next
    },

    setHighlightSlot(slot) {
      highlightSlot = slot ?? -1
    },

    count() {
      return count
    },

    isAttached() {
      return attached
    },

    render(context: GlContext, args: CustomRenderMethodInput) {
      if (count === 0 || !packed) return
      const shader = getShader(context, args.shaderData)
      if (shader.aStart < 0 || shader.aDelta < 0 || shader.aRgb < 0) return

      if (!buffer) buffer = context.createBuffer()
      context.bindBuffer(context.ARRAY_BUFFER, buffer)
      if (dirty) {
        const bytes = packed.byteLength
        /* Grow in place only when it has to: the usual case is a same-size
           refill, which bufferSubData does without reallocating. */
        if (bytes > bufferBytes) {
          context.bufferData(context.ARRAY_BUFFER, packed, context.DYNAMIC_DRAW)
          bufferBytes = bytes
        } else {
          context.bufferSubData(context.ARRAY_BUFFER, 0, packed)
        }
        dirty = false
      }

      const stride = SWARM_FLOATS_PER_SATELLITE * 4
      context.useProgram(shader.program)

      /* The prelude MapLibre injects declares these uniforms but does not fill
         them: a custom layer binds its own projection state every frame, or
         projectTileFor3D reads zeros and every point lands at the origin. */
      const projection = args.defaultProjectionData
      context.uniformMatrix4fv(
        context.getUniformLocation(shader.program, 'u_projection_fallback_matrix'),
        false,
        projection.fallbackMatrix,
      )
      context.uniformMatrix4fv(
        context.getUniformLocation(shader.program, 'u_projection_matrix'),
        false,
        projection.mainMatrix,
      )
      context.uniform4f(
        context.getUniformLocation(shader.program, 'u_projection_tile_mercator_coords'),
        ...projection.tileMercatorCoords,
      )
      context.uniform4f(
        context.getUniformLocation(shader.program, 'u_projection_clipping_plane'),
        ...projection.clippingPlane,
      )
      context.uniform1f(
        context.getUniformLocation(shader.program, 'u_projection_transition'),
        projection.projectionTransition,
      )

      context.enableVertexAttribArray(shader.aStart)
      context.vertexAttribPointer(shader.aStart, 3, context.FLOAT, false, stride, 0)
      context.enableVertexAttribArray(shader.aDelta)
      context.vertexAttribPointer(shader.aDelta, 3, context.FLOAT, false, stride, 12)
      context.enableVertexAttribArray(shader.aRgb)
      context.vertexAttribPointer(shader.aRgb, 3, context.FLOAT, false, stride, 24)

      const nowMs = Date.now()
      const raw = spanMs > 0 ? (nowMs - epochMs) / spanMs : 0
      const progress = Math.max(0, Math.min(1, raw))
      if (trace) {
        trace.push({ tMs: nowMs, raw, progress, epochMs, spanMs })
        if (trace.length > TRACE_MAX) trace.shift()
      }
      context.uniform1f(shader.uProgress, progress)
      context.uniform1f(shader.uPointSize, pointSize)
      context.uniform1f(shader.uAlpha, alpha)
      context.uniform1f(shader.uHighlight, highlightSlot)
      /* Metres under globe; mercator units under mercator, where elevation is a
         Z in the same 0..1 world space as the position. */
      const mercatorVariant = args.shaderData.variantName !== 'globe'
      const metresToUnits = mercatorVariant
        ? MercatorCoordinate.fromLngLat({ lng: 0, lat: 0 }).meterInMercatorCoordinateUnits()
        : 1
      context.uniform1f(shader.uElevationScale, elevationEnabled ? metresToUnits : 0)

      context.enable(context.BLEND)
      context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA)
      context.drawArrays(context.POINTS, 0, count)

      // Leave the attribute state as it was found, or MapLibre's own draws inherit it.
      context.disableVertexAttribArray(shader.aStart)
      context.disableVertexAttribArray(shader.aDelta)
      context.disableVertexAttribArray(shader.aRgb)
    },
  }
}
