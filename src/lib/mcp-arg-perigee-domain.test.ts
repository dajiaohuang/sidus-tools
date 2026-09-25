import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

const tool = MCP_TOOL_DEFS.find((entry) => entry.name === 'arg_perigee_drift_j2')!

describe('arg_perigee_drift_j2 MCP domain', () => {
  it('rejects a circular orbit because its argument of perigee is undefined', () => {
    expect(tool.inputSchema.e.safeParse(0).success).toBe(false)
    expect(tool.run({ a_m: 6778137, e: 0, i_deg: 51.6 })).toBeNull()
  })

  it('returns the secular rate for a noncircular elliptic orbit', () => {
    expect(tool.inputSchema.e.safeParse(0.001).success).toBe(true)
    const result = tool.run({ a_m: 6778137, e: 0.001, i_deg: 51.6 }) as {
      argp_rate_rad_s: number
    }
    expect(result.argp_rate_rad_s).toBeCloseTo(7.557608005976236e-7, 18)
  })
})
