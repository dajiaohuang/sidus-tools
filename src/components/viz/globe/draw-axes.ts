/**
 * Earth's rotation and magnetic axes, drawn through the globe on the sky
 * canvas. The geometry lives in axes.ts; this is the stroking, split from the
 * map component because it is a pure function of a canvas and a camera.
 */

import type { ProjectionData } from 'maplibre-gl'
import {
  axisDirection,
  axisSamples,
  GEOMAGNETIC_POLE_LAT_DEG,
  GEOMAGNETIC_POLE_LON_DEG,
} from './axes'
import { GLOBE_RADIUS_M } from './track'
import { isPointOccludedByGlobe } from './sun'
import { projectElevatedToScreen } from './projection'

/** How the two axes are told apart: the classic white axle and a blue compass. */
const ROTATION_AXIS_COLOR = '#e8e8e8'
const MAGNETIC_AXIS_COLOR = '#7fc4e8'
/** Alpha in front of the planet, and behind it. */
const AXIS_ALPHA_FRONT = 0.85
const AXIS_ALPHA_BEHIND = 0.18

/**
 * Draws Earth's rotation and magnetic axes through the globe.
 *
 * Each axis is one straight line in three dimensions, but it is stroked as a
 * chain: the planet hides its middle, and drawing the hidden stretch faint
 * rather than dropping it is what makes the thing read as an axle THROUGH a
 * solid body instead of as two unexplained stubs. Where the globe starts and
 * stops hiding it moves with the camera, so it is decided per sample rather
 * than assumed.
 */
export function drawGlobeAxes(
  ctx: CanvasRenderingContext2D,
  projection: ProjectionData,
  width: number,
  height: number,
  variantName: string | null,
): void {
  /* A flat map has no near and far side, so an axle through the planet is not
     a thing that can be drawn on one. */
  if (variantName === 'mercator') return

  const axes: { poleLatDeg: number; poleLonDeg: number; color: string }[] = [
    { poleLatDeg: 90, poleLonDeg: 0, color: ROTATION_AXIS_COLOR },
    {
      poleLatDeg: GEOMAGNETIC_POLE_LAT_DEG,
      poleLonDeg: GEOMAGNETIC_POLE_LON_DEG,
      color: MAGNETIC_AXIS_COLOR,
    },
  ]

  ctx.save()
  ctx.lineWidth = 1
  ctx.setLineDash([])
  for (const axis of axes) {
    const samples = axisSamples(axis.poleLatDeg, axis.poleLonDeg, GLOBE_RADIUS_M)
    /* Front and back are stroked as two passes rather than one path with a
       changing alpha, because a canvas path carries ONE alpha: mixing them
       would either wash out the visible half or print the hidden one solid. */
    for (const behind of [true, false]) {
      ctx.beginPath()
      ctx.strokeStyle = axis.color
      ctx.globalAlpha = behind ? AXIS_ALPHA_BEHIND : AXIS_ALPHA_FRONT
      let drawing = false
      for (const sample of samples) {
        const scale = 1 + sample.elevationM / GLOBE_RADIUS_M
        const unit = axisDirection(sample.lonDeg, sample.latDeg)
        const hidden = isPointOccludedByGlobe(
          [unit[0] * scale, unit[1] * scale, unit[2] * scale],
          projection.clippingPlane,
        )
        if (hidden !== behind) {
          drawing = false
          continue
        }
        const screen = projectElevatedToScreen(
          sample.lonDeg,
          sample.latDeg,
          sample.elevationM,
          projection,
          width,
          height,
          variantName,
        )
        if (!screen) {
          drawing = false
          continue
        }
        if (drawing) ctx.lineTo(screen.x, screen.y)
        else ctx.moveTo(screen.x, screen.y)
        drawing = true
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}
