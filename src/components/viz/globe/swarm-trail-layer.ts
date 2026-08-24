/**
 * One draw call for every trail in the swarm.
 *
 * The buffer holds independent `gl.LINES` pairs (see swarmTrails.ts), so a
 * single `gl.drawArrays` covers the whole population and a break inside a trail
 * costs a degenerate pair rather than a second draw. Positions are static for a
 * given element set, so the buffer is filled once per satellite and then only
 * read: the per-frame cost is the uniform writes and the draw.
 *
 * Trails arrive in batches while the worker works through the population, so
 * the buffer is allocated for the whole count up front and each batch is
 * uploaded into its own range with bufferSubData. Only the contiguous prefix
 * that has actually been filled is drawn, which is what makes the population
 * appear progressively instead of flashing in whole.
 *
 * The vertices are EARTH-FIXED ground tracks (see swarmTrails.ts), kept
 * current by the caller's looping batch production, so nothing here spins:
 * a trajectory over ground stands still on the ground.
 *
 * ## Width
 *
 * The intended weight is a fraction of a pixel, and GL cannot rasterise that:
 * `lineWidth` is clamped to 1 on essentially every core profile, and a line is
 * either one pixel wide or it is not drawn. Sub-pixel weight is therefore
 * expressed as COVERAGE instead: the line is rasterised at one pixel and its
 * alpha carries the width, so a 0.35 px equivalent at 0.15 base alpha reaches
 * the frame as one pixel at 0.0525. That product is what the eye integrates,
 * and it is the only honest way to spend less than a pixel.
 *
 * Every sealed constraint the other custom layers established is honoured here
 * for the same reasons: the precision header is the first statement of the
 * fragment shader, shaders are cached per variant name because MapLibre's
 * prelude differs between globe and mercator, elevation units are variant
 * dependent, and all GL state is set inside render() and restored before it
 * returns.
 */

import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
} from 'maplibre-gl'
import { SPHERE_OCCLUSION_GLSL } from './occlusion'
import {
  SWARM_TRAIL_FLOATS_PER_SATELLITE,
  SWARM_TRAIL_FLOATS_PER_VERTEX,
  SWARM_TRAIL_VERTICES_PER_SATELLITE,
} from './swarm-trails'

export const SWARM_TRAIL_LAYER_ID = 'sidus-orbit-swarm-trails'

/** Base weight of a trail, as the fraction of a pixel it is meant to read as. */
export const SWARM_TRAIL_WIDTH_PX = 0.35
/** Base alpha before the width coverage is folded in. */
export const SWARM_TRAIL_ALPHA = 0.15

type GlContext = WebGLRenderingContext | WebGL2RenderingContext

type ShaderEntry = {
  program: WebGLProgram
  aPosition: number
  aRgb: number
  uAlpha: WebGLUniformLocation | null
  uElevationScale: WebGLUniformLocation | null
}

export type SwarmTrailLayer = CustomLayerInterface & {
  /** Sizes the buffer for the whole population. Discards anything already in it. */
  reset(satelliteCount: number): void
  /** Uploads one batch of packed trails at its own offset in the population. */
  setBatch(packed: Float32Array, startIndex: number, count: number): void
  /** Trails drawn: the contiguous prefix that has arrived. */
  filled(): number
  /**
   * The camera state of the last frame, for the CPU picking.
   *
   * The altitude layer also exposes this, but it is added and removed by its
   * own toggle, so a caller that depended on it would find picking dead
   * whenever the toggle was off. This layer exists exactly while the swarm is
   * drawn, which is exactly when the swarm can be picked.
   */
  lastProjectionData(): CustomRenderMethodInput['defaultProjectionData'] | null
  lastVariantName(): string | null
  /**
   * The population's baseline weight, and the user's multipliers on top.
   *
   * The baseline is a function of how many satellites there are and nothing
   * else, so two satellites and ten thousand are governed by one rule.
   */
  setAppearance(
    baseWidthPx: number,
    baseAlpha: number,
    widthMultiplier: number,
    alphaMultiplier: number,
  ): void
  /**
   * The one satellite whose trail is drawn saturated, or null. Its own pass
   * ignores the tier baseline and the appearance multipliers: it exists to say
   * "this one", and a control that could dim it back into the crowd would
   * defeat that.
   */
  setHighlight(satelliteIndex: number | null): void
  /**
   * True draws ONLY the highlighted trail, and nothing at all when there is
   * none. Ten thousand overlapping revolutions are a texture; sometimes the
   * question is about one orbit, and the only way to answer it is to take the
   * other ten thousand away rather than dim them.
   */
  setOnlyHighlighted(on: boolean): void
  /** False draws the trails on the surface, matching the altitude toggle. */
  setElevationEnabled(on: boolean): void
  isAttached(): boolean
}

export function createSwarmTrailLayer(options: {
  onError: (label: string, error: unknown) => void
}): SwarmTrailLayer {
  const { onError } = options
  const shaderMap = new Map<string, ShaderEntry>()

  let gl: GlContext | null = null
  let buffer: WebGLBuffer | null = null
  let bufferBytes = 0
  let satelliteCount = 0
  /** Highest contiguous satellite index that has been filled. */
  let filledCount = 0
  /** Arrived batches by start index, so the drawn prefix can advance over them. */
  const arrived = new Map<number, number>()
  let attached = false
  let elevationEnabled = true
  let widthMultiplier = 1
  let alphaMultiplier = 1
  let baseWidthPx = SWARM_TRAIL_WIDTH_PX
  let baseAlpha = SWARM_TRAIL_ALPHA
  let highlight: number | null = null
  let onlyHighlighted = false
  let projectionData: CustomRenderMethodInput['defaultProjectionData'] | null = null
  let variantName: string | null = null

  function getShader(
    context: GlContext,
    shaderDescription: CustomRenderMethodInput['shaderData'],
  ): ShaderEntry {
    const cached = shaderMap.get(shaderDescription.variantName)
    if (cached) return cached

    /* Both ends of a segment are placed in the SAME copy of the world before
       projecting: shading is per vertex, so without the partner's x a segment
       straddling the antimeridian seam would come out as a line across every
       meridian between the two halves. */
    /* Under the globe the prelude's z is a horizon-PLANE clip, which cuts a
       high orbit's far arcs off mid-air; it is overwritten with the exact
       sphere occlusion (see occlusion.ts). The mercator prelude has neither
       the plane nor projectToSphere, so the override exists only under the
       globe variant. */
    const globeVariant = shaderDescription.variantName === 'globe'
    const vertexSource = `#version 300 es
    ${shaderDescription.vertexShaderPrelude}
    ${shaderDescription.define}
    ${globeVariant ? SPHERE_OCCLUSION_GLSL : ''}

    in vec4 a_position;
    in vec3 a_rgb;
    uniform float u_elevation_scale;
    out vec3 v_rgb;

    void main() {
        float here = a_position.x;
        float partner = a_position.w;
        /* Exactly ONE end may move, or the two would part by a whole world
           instead of meeting: the lower one is the one that steps up. */
        if (partner - here > 0.5) here += 1.0;
        vec2 pos = vec2(here, a_position.y);
        gl_Position = projectTileFor3D(pos, a_position.z * u_elevation_scale);
        ${
          globeVariant
            ? `gl_Position.z =
        sphereOcclusionClipZ(projectToSphere(pos) * (1.0 + a_position.z * u_elevation_scale / GLOBE_RADIUS)) *
        gl_Position.w;`
            : ''
        }
        v_rgb = a_rgb;
    }`

    const fragmentSource = `#version 300 es
    precision mediump float;
    in vec3 v_rgb;
    uniform float u_alpha;
    out highp vec4 fragColor;
    void main() {
        fragColor = vec4(v_rgb, u_alpha);
    }`

    const vertexShader = context.createShader(context.VERTEX_SHADER)!
    context.shaderSource(vertexShader, vertexSource)
    context.compileShader(vertexShader)
    if (!context.getShaderParameter(vertexShader, context.COMPILE_STATUS)) {
      onError('Swarm trail vertex shader COMPILE FAILED', context.getShaderInfoLog(vertexShader) ?? '')
    }

    const fragmentShader = context.createShader(context.FRAGMENT_SHADER)!
    context.shaderSource(fragmentShader, fragmentSource)
    context.compileShader(fragmentShader)
    if (!context.getShaderParameter(fragmentShader, context.COMPILE_STATUS)) {
      onError(
        'Swarm trail fragment shader COMPILE FAILED',
        context.getShaderInfoLog(fragmentShader) ?? '',
      )
    }

    const program = context.createProgram()!
    context.attachShader(program, vertexShader)
    context.attachShader(program, fragmentShader)
    context.linkProgram(program)
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      onError('Swarm trail program LINK FAILED', context.getProgramInfoLog(program) ?? '')
    }

    const entry: ShaderEntry = {
      program,
      aPosition: context.getAttribLocation(program, 'a_position'),
      aRgb: context.getAttribLocation(program, 'a_rgb'),
      uAlpha: context.getUniformLocation(program, 'u_alpha'),
      uElevationScale: context.getUniformLocation(program, 'u_elevation_scale'),
    }
    shaderMap.set(shaderDescription.variantName, entry)
    return entry
  }

  /** Pending uploads, drained inside render() where the context is legal to touch. */
  const uploads: { packed: Float32Array; startIndex: number; count: number }[] = []

  return {
    id: SWARM_TRAIL_LAYER_ID,
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

    reset(nextCount) {
      satelliteCount = nextCount
      filledCount = 0
      arrived.clear()
      uploads.length = 0
      /* The buffer is reallocated on the next render, where the context is
         available; dropping the byte count is what asks for that. */
      bufferBytes = 0
    },

    setBatch(packed, startIndex, count) {
      if (count <= 0 || startIndex + count > satelliteCount) return
      uploads.push({ packed, startIndex, count })
      /* A batch landing entirely INSIDE the drawn prefix is re-doing a trail
         that already counted, so it has no place in the arrival bookkeeping:
         recording it would leave an entry the prefix loop can never consume. */
      if (startIndex + count <= filledCount) return
      arrived.set(startIndex, Math.max(arrived.get(startIndex) ?? 0, count))
      /*
       * Only a contiguous prefix is drawn, so a batch that arrives out of
       * turn waits rather than exposing the unfilled gap ahead of it as a
       * fan of stray lines through the origin.
       *
       * The advance consumes any batch that OVERLAPS the frontier, not only
       * one that starts exactly on it: the identified satellite's one-trail
       * refresh can land exactly at the frontier and advance it by one, and
       * the sequential batch that then arrives one behind the new frontier
       * must still be consumed or the prefix stalls there for good.
       */
      for (;;) {
        let advanced = false
        for (const [start, size] of arrived) {
          if (start + size <= filledCount) {
            arrived.delete(start)
          } else if (start <= filledCount) {
            filledCount = start + size
            arrived.delete(start)
            advanced = true
          }
        }
        if (!advanced) break
      }
    },

    filled() {
      return filledCount
    },

    lastProjectionData() {
      return projectionData
    },

    lastVariantName() {
      return variantName
    },

    setAppearance(nextBaseWidth, nextBaseAlpha, width, alpha) {
      baseWidthPx = nextBaseWidth
      baseAlpha = nextBaseAlpha
      widthMultiplier = width
      alphaMultiplier = alpha
    },

    setHighlight(satelliteIndex) {
      highlight = satelliteIndex
    },

    setOnlyHighlighted(on) {
      onlyHighlighted = on
    },

    setElevationEnabled(on) {
      elevationEnabled = on
    },

    isAttached() {
      return attached
    },

    render(context: GlContext, args: CustomRenderMethodInput) {
      /* Recorded BEFORE any early return: the picking needs the live camera on
         every frame the swarm is up, including frames where there is nothing
         new to draw. */
      projectionData = args.defaultProjectionData
      variantName = args.shaderData.variantName
      if (satelliteCount === 0) return
      const shader = getShader(context, args.shaderData)
      if (shader.aPosition < 0 || shader.aRgb < 0) return

      if (!buffer) buffer = context.createBuffer()
      context.bindBuffer(context.ARRAY_BUFFER, buffer)

      const wanted = satelliteCount * SWARM_TRAIL_FLOATS_PER_SATELLITE * 4
      if (bufferBytes !== wanted) {
        context.bufferData(context.ARRAY_BUFFER, wanted, context.DYNAMIC_DRAW)
        bufferBytes = wanted
      }
      for (const upload of uploads) {
        context.bufferSubData(
          context.ARRAY_BUFFER,
          upload.startIndex * SWARM_TRAIL_FLOATS_PER_SATELLITE * 4,
          upload.packed,
        )
      }
      uploads.length = 0

      if (filledCount === 0) return

      context.useProgram(shader.program)

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

      const stride = SWARM_TRAIL_FLOATS_PER_VERTEX * 4
      context.enableVertexAttribArray(shader.aPosition)
      context.vertexAttribPointer(shader.aPosition, 4, context.FLOAT, false, stride, 0)
      context.enableVertexAttribArray(shader.aRgb)
      context.vertexAttribPointer(shader.aRgb, 3, context.FLOAT, false, stride, 16)

      /* Sub-pixel width spent as coverage, per the note at the top. The
         BASELINE comes from the population size, so it is the same rule for a
         pair of satellites as for ten thousand; the multipliers are the user's
         own adjustment on top. */
      const coverage = Math.min(1, baseWidthPx * widthMultiplier)
      context.uniform1f(shader.uAlpha, Math.min(1, baseAlpha * alphaMultiplier * coverage))

      const mercatorVariant = args.shaderData.variantName !== 'globe'
      const metresToUnits = mercatorVariant
        ? MercatorCoordinate.fromLngLat({ lng: 0, lat: 0 }).meterInMercatorCoordinateUnits()
        : 1
      context.uniform1f(shader.uElevationScale, elevationEnabled ? metresToUnits : 0)

      context.enable(context.BLEND)
      context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA)
      /* The population pass, unless the view has been narrowed to one orbit.
         The highlight pass below still runs, so "only this one" and "this one
         picked out of the crowd" are the same draw with the crowd omitted. */
      if (!onlyHighlighted) {
        context.drawArrays(
          context.LINES,
          0,
          filledCount * SWARM_TRAIL_VERTICES_PER_SATELLITE,
        )
      }

      /* The identified trail again, opaque, over the top of its faint self.
         One extra draw, which is why this is a second pass rather than a
         per-vertex flag the whole population would carry. Its own colour comes
         from the buffer like everyone else's; only the alpha changes. */
      if (highlight !== null && highlight < filledCount) {
        context.uniform1f(shader.uAlpha, 1)
        context.drawArrays(
          context.LINES,
          highlight * SWARM_TRAIL_VERTICES_PER_SATELLITE,
          SWARM_TRAIL_VERTICES_PER_SATELLITE,
        )
      }

      context.disableVertexAttribArray(shader.aPosition)
      context.disableVertexAttribArray(shader.aRgb)
    },
  }
}
