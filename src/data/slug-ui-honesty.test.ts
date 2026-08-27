/**
 * Eddy-class slug honesty: if the id or title promises a path/map/pass,
 * the registered UI must ship a path, not a scalar.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getTool, TOOL_REDIRECTS, TOOLS } from './tools'
import { TOOL_OG } from '@/lib/og/catalog'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

const PATH_TOKENS = [
  'track',
  'map',
  'plot',
  'pass',
  'swath',
  'footprint',
  'coverage',
  'horizon',
  'visibility',
  'path',
  'porkchop',
  '3d',
  'globe',
  'view',
  'constellation',
  'access',
] as const

const SCALAR_TITLE_TOKENS = ['shift', 'rate', 'period', 'angle', 'budget', 'noise'] as const

/**
 * Explicit exceptions: slug has a path token, UI is a scalar, title is honest.
 * One row per id. Do not rubber-stamp a lie.
 *
 * Catalog pass 2026-08-26, all 191 live tools:
 * ground-track was the Eddy lie (fixed). porkchop-earth-mars titled "sketch"
 * but shipped only min-Δv cards (fixed: PorkchopPlot heatmap).
 * Other visualization names (orbit-3d, orbital-view, pass-predict, plotter)
 * already draw. Remaining token hits are honest scalars (period, ΔM, width,
 * Δv, Walker spacing, surface g/escape).
 */
const ALLOWLIST: Record<string, string> = {
  'ground-track-shift': 'longitude shift per rev. Scalar. Slug and title both say shift.',
  'repeating-ground-track': 'period T from k orbits / n days. Scalar. Title says period.',
  'along-track': 'ΔM ↔ along-track distance. Scalar map, not a drawn track.',
  'flight-path-angle': 'angle. Scalar.',
  'star-tracker-noise': 'noise. Scalar. "tracker" is not a drawn track.',
  'aerobraking-pass': 'page is a Δv/heating scalar; title says Δv.',
  'coverage-swath': 'ground width from h+FOV. Title is the width, not a drawn swath.',
  'horizon-range': 'range number. Title says slant range.',
  'pass-predict': 'title says next visible pass; UI must show AOS/LOS/max-el (classified as path).',
  plotter: 'generic f(x) SVG. Honest if it plots (classified as path).',
  'constellation-walker': 'T/P sats-per-plane and angular spacing. Description says spacing, not a drawn constellation.',
}

const PATH_MARKERS =
  /\b(WorldMap|GlobeMap|FunctionPlot|OrbitScene3D|PorkchopPlot|findNextPass|groundTrack|keplerGroundTrack)\b/

type UiClass = 'path' | 'scalar'

function wholeWord(hay: string, token: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`, 'i').test(hay)
}

function parseRendererMap(src: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /'([^']+)': L\(\(\) => import\('\.\/([^']+)'\)/g
  for (const m of src.matchAll(re)) {
    map.set(m[1]!, m[2]!)
  }
  return map
}

function classifyComponent(relImport: string): UiClass {
  const file = join(ROOT, 'src/components/tools', `${relImport}.tsx`)
  let src: string
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    return 'scalar'
  }
  if (PATH_MARKERS.test(src)) return 'path'
  return 'scalar'
}

function report(parts: { id: string; title: string; formula: string; uiClass: UiClass; why: string }): string {
  return `${parts.id} | title=${parts.title} | formula=${parts.formula} | class=${parts.uiClass} | ${parts.why}`
}

describe('slug vs UI honesty', () => {
  const rendererSrc = readFileSync(join(ROOT, 'src/components/tools/ToolRenderer.tsx'), 'utf8')
  const renderer = parseRendererMap(rendererSrc)
  const live = TOOLS.filter((t) => t.status === 'live')

  it('parses the ToolRenderer registry', () => {
    expect(renderer.size).toBeGreaterThan(50)
    expect(renderer.get('ground-track')).toBe('GroundTrackTool')
    expect(renderer.get('ground-track-shift')).toBe('GroundTrackShiftTool')
  })

  it('ground-track is a path, not the shift-only component', () => {
    expect(renderer.get('ground-track')).not.toBe('GroundTrackShiftTool')
    expect(classifyComponent(renderer.get('ground-track')!)).toBe('path')
  })

  it('porkchop-earth-mars ships a heatmap, not only min-Δv cards', () => {
    expect(classifyComponent(renderer.get('porkchop-earth-mars')!)).toBe('path')
  })

  it('every live tool has a ToolRenderer entry', () => {
    const missing = live.filter((t) => !renderer.has(t.id)).map((t) => t.id)
    expect(missing, missing.join(', ')).toEqual([])
  })

  it('fails when a path-token slug/title ships a scalar UI (unless allowlisted)', () => {
    const failures: string[] = []
    for (const tool of live) {
      const rel = renderer.get(tool.id)
      const uiClass: UiClass = rel ? classifyComponent(rel) : 'scalar'
      const og = TOOL_OG[tool.id]
      const formula = og?.formula ?? tool.formulaId ?? ''
      const idOrTitle = `${tool.id} ${tool.title}`
      const hasPathToken = PATH_TOKENS.some((tok) => wholeWord(idOrTitle, tok))
      const titleIsScalarKind = SCALAR_TITLE_TOKENS.some((tok) => wholeWord(tool.title, tok))
      const idIsPathToken = PATH_TOKENS.some((tok) => wholeWord(tool.id, tok))
      const allowed = Boolean(ALLOWLIST[tool.id])

      if (hasPathToken && uiClass === 'scalar' && !allowed) {
        failures.push(
          report({
            id: tool.id,
            title: tool.title,
            formula,
            uiClass,
            why: 'path token in id/title but UI is scalar',
          }),
        )
      }

      if (idIsPathToken && titleIsScalarKind && uiClass === 'scalar' && !allowed) {
        failures.push(
          report({
            id: tool.id,
            title: tool.title,
            formula,
            uiClass,
            why: 'id is a path token and title is shift/rate/period/angle/budget/noise without a path UI',
          }),
        )
      }

      const ogClaimsTrack =
        og &&
        /ground[- ]track/i.test(og.blurb) &&
        !/shift|period/i.test(og.blurb)
      const formulaIsOnlyShift = og ? /ΔL/.test(og.formula) && !/φ|lat|lon/i.test(og.formula) : false
      if ((tool.id === 'ground-track' || ogClaimsTrack) && formulaIsOnlyShift) {
        failures.push(
          report({
            id: tool.id,
            title: tool.title,
            formula: og?.formula ?? '',
            uiClass,
            why: `OG blurb "${og?.blurb ?? ''}" says ground track but formula is only ΔL`,
          }),
        )
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('retired slugs redirect to a live tool and are not themselves live', () => {
    expect(Object.keys(TOOL_REDIRECTS).length).toBeGreaterThan(0)
    for (const [from, to] of Object.entries(TOOL_REDIRECTS)) {
      expect(getTool(from), from).toBeUndefined()
      expect(getTool(to)?.status, to).toBe('live')
      expect(renderer.has(to), to).toBe(true)
    }
  })

  it('every allowlist id exists and states a reason', () => {
    for (const [id, reason] of Object.entries(ALLOWLIST)) {
      expect(TOOLS.some((t) => t.id === id), id).toBe(true)
      expect(reason.length, id).toBeGreaterThan(8)
    }
  })
})
