import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'
import { circularizeBurn } from './physics/maneuvers'

const circularizeTool = MCP_TOOL_DEFS.find((tool) => tool.name === 'circularize')
if (!circularizeTool) throw new Error('circularize MCP tool is missing')

const schema = z.object(circularizeTool.inputSchema)
const valid = { a_m: 7_500_000, e: 0.1, at: 'apo' as const }

describe('circularize MCP domain', () => {
  it('accepts finite elliptic inputs and an omitted optional mu', () => {
    expect(schema.safeParse(valid).success).toBe(true)
    expect(schema.safeParse({ ...valid, at: 'peri' }).success).toBe(true)
    expect(schema.safeParse({ ...valid, mu: 3.986004418e14 }).success).toBe(true)
  })

  it('rejects nonpositive or non-finite semi-major axis and gravitational parameter', () => {
    for (const a_m of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(schema.safeParse({ ...valid, a_m }).success).toBe(false)
    }
    for (const mu of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(schema.safeParse({ ...valid, mu }).success).toBe(false)
    }
  })

  it('rejects eccentricity outside the finite elliptic interval and unknown apsides', () => {
    for (const e of [-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(schema.safeParse({ ...valid, e }).success).toBe(false)
    }
    expect(schema.safeParse({ ...valid, at: 'perii' }).success).toBe(false)
  })

  it('returns null for invalid direct helper and handler calls instead of non-finite output or apo coercion', () => {
    expect(circularizeBurn(-3.986004418e14, valid.a_m, valid.e, 'apo')).toBeNull()
    expect(circularizeBurn(Number.POSITIVE_INFINITY, valid.a_m, valid.e, 'apo')).toBeNull()
    expect(circularizeBurn(3.986004418e14, Number.POSITIVE_INFINITY, valid.e, 'apo')).toBeNull()
    expect(circularizeBurn(3.986004418e14, valid.a_m, Number.NaN, 'apo')).toBeNull()
    expect(circularizeBurn(3.986004418e14, valid.a_m, valid.e, 'perii' as 'apo')).toBeNull()

    expect(circularizeTool.run({ ...valid, at: 'perii' })).toBeNull()
    expect(circularizeTool.run({ ...valid, mu: -3.986004418e14 })).toBeNull()
  })

  it('returns null when finite extreme inputs overflow a derived apsis or speed', () => {
    expect(circularizeBurn(3.986004418e14, Number.MAX_VALUE, 0.5, 'apo')).toBeNull()
    expect(circularizeBurn(Number.MAX_VALUE, Number.MIN_VALUE, 0, 'apo')).toBeNull()
  })
})
