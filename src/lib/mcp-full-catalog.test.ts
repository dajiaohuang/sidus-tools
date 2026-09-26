import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

describe('true_anomaly MCP domain', () => {
  const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'true_anomaly')!

  it('rejects non-elliptic or non-positive orbit inputs', () => {
    expect(tool.inputSchema.a_m.safeParse(8_000_000).success).toBe(true)
    expect(tool.inputSchema.a_m.safeParse(0).success).toBe(false)
    expect(tool.inputSchema.e.safeParse(0).success).toBe(true)
    expect(tool.inputSchema.e.safeParse(1).success).toBe(false)
    expect(tool.inputSchema.e.safeParse(1.2).success).toBe(false)

    expect(tool.run({ a_m: 8_000_000, e: 1.2, nu_deg: 0 })).toBeNull()
    expect(tool.run({ a_m: -8_000_000, e: 0.2, nu_deg: 0 })).toBeNull()
    expect(tool.run({ a_m: 8_000_000, e: Number.NaN, nu_deg: 0 })).toBeNull()
    expect(tool.run({ a_m: 8_000_000, e: 0.2, nu_deg: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('retains the valid elliptic radius result', () => {
    const result = tool.run({ a_m: 8_000_000, e: 0.1, nu_deg: 0 }) as {
      r_m: number
      nu_rad: number
    }
    expect(result.r_m).toBeCloseTo(7_200_000, 6)
    expect(result.nu_rad).toBe(0)
  })
})
