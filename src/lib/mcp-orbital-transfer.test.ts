import { describe, expect, it } from 'vitest'
import * as z from 'zod/v4'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

function tool(name: string) {
  const definition = MCP_TOOL_DEFS.find((entry) => entry.name === name)
  if (!definition) throw new Error(`missing MCP tool ${name}`)
  return definition
}

function inputSchema(name: string) {
  return z.object(tool(name).inputSchema as z.ZodRawShape)
}

describe('orbital-transfer MCP input domains', () => {
  const hohmann = tool('hohmann')
  const bielliptic = tool('bielliptic')

  it('requires finite positive Hohmann radii and gravitational parameter', () => {
    const schema = inputSchema('hohmann')
    const sample = { r1_m: 6_778_137, r2_m: 42_164_000 }

    for (const invalid of [0, -1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NaN]) {
      for (const args of [
        { ...sample, r1_m: invalid },
        { ...sample, r2_m: invalid },
        { ...sample, mu: invalid },
      ]) {
        expect(schema.safeParse(args).success).toBe(false)
        expect(hohmann.run(args)).toBeNull()
      }
    }

    expect(schema.safeParse(sample).success).toBe(true)
  })

  it('requires a finite positive bielliptic apoapsis above both endpoint radii', () => {
    const schema = inputSchema('bielliptic')
    const sample = { r1_m: 6_778_137, r2_m: 42_164_000, rb_m: 168_656_000 }

    for (const invalid of [0, -1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NaN]) {
      for (const args of [
        { ...sample, r1_m: invalid },
        { ...sample, r2_m: invalid },
        { ...sample, rb_m: invalid },
        { ...sample, mu: invalid },
      ]) {
        expect(schema.safeParse(args).success).toBe(false)
        expect(bielliptic.run(args)).toBeNull()
      }
    }

    for (const rb_m of [sample.r1_m, sample.r2_m, 7_378_137]) {
      const args = { ...sample, rb_m }
      expect(schema.safeParse(args).success).toBe(true)
      expect(bielliptic.run(args)).toBeNull()
    }

    const valid = bielliptic.run(sample)
    expect(valid).not.toBeNull()
    expect(Object.values(valid!).every(Number.isFinite)).toBe(true)
    expect(valid!.dv1).toBeGreaterThanOrEqual(0)
    expect(valid!.dv2).toBeGreaterThanOrEqual(0)
    expect(valid!.dv3).toBeGreaterThanOrEqual(0)
    expect(valid!.tof).toBeGreaterThan(0)
  })
})
