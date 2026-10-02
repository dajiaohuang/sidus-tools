import { describe, expect, it } from 'vitest'
import * as z from 'zod/v4'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

const sgp4Tool = MCP_TOOL_DEFS.find((tool) => tool.name === 'sgp4')
if (!sgp4Tool) throw new Error('Missing sgp4 MCP catalog entry')

const sgp4Schema = z.object(sgp4Tool.inputSchema)

describe('sgp4 MCP mean-motion sketch', () => {
  it('rejects zero and negative revolutions per day', () => {
    expect(sgp4Schema.safeParse({ n_rev_day: 0 }).success).toBe(false)
    expect(sgp4Schema.safeParse({ n_rev_day: -15.5 }).success).toBe(false)
  })

  it('returns positive finite angular motion and period for a nominal input', () => {
    const args = sgp4Schema.parse({ n_rev_day: 15.5 })
    const result = sgp4Tool.run(args)
    expect(result).toMatchObject({
      n_rad_s: 0.0011271918085796711,
      period_s: 5574.193548387097,
      note: 'Use UI SGP4 tool for full TLE propagation',
    })
  })

  it('does not return a non-finite period for a positive underflow boundary', () => {
    const args = sgp4Schema.parse({ n_rev_day: Number.MIN_VALUE })
    expect(sgp4Tool.run(args)).toBeNull()
  })
})
