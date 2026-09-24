import { describe, expect, it } from 'vitest'
import * as z from 'zod/v4'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

const lookAnglesTool = MCP_TOOL_DEFS.find((tool) => tool.name === 'look_angles')
if (!lookAnglesTool) throw new Error('Missing look_angles MCP catalog entry')

const lookAnglesSchema = z.object(lookAnglesTool.inputSchema)

describe('look_angles MCP sketch', () => {
  it('rejects negative ground distance in the public input schema', () => {
    expect(
      lookAnglesSchema.safeParse({ ground_range_m: -500_000, delta_h_m: 400_000 }).success,
    ).toBe(false)
  })

  it('rejects the degenerate zero line-of-sight', () => {
    const args = lookAnglesSchema.parse({ ground_range_m: 0, delta_h_m: 0 })
    expect(lookAnglesTool.run(args)).toBeNull()
  })

  it('preserves valid vertical cases with signed height difference', () => {
    const above = lookAnglesTool.run(lookAnglesSchema.parse({ ground_range_m: 0, delta_h_m: 10 }))
    const below = lookAnglesTool.run(lookAnglesSchema.parse({ ground_range_m: 0, delta_h_m: -10 }))
    expect(above).toMatchObject({ elev_rad: Math.PI / 2, slant_m: 10 })
    expect(below).toMatchObject({ elev_rad: -Math.PI / 2, slant_m: 10 })
  })

  it('matches the nominal right-triangle geometry', () => {
    const args = lookAnglesSchema.parse({ ground_range_m: 500_000, delta_h_m: 400_000 })
    const result = lookAnglesTool.run(args)
    expect(result).toMatchObject({
      elev_rad: Math.atan2(400_000, 500_000),
      slant_m: Math.hypot(500_000, 400_000),
      note: 'Educational; full TLE look-angles in UI',
    })
  })

  it('rejects finite inputs whose slant range overflows the numeric output', () => {
    const args = lookAnglesSchema.parse({
      ground_range_m: Number.MAX_VALUE,
      delta_h_m: Number.MAX_VALUE,
    })
    expect(lookAnglesTool.run(args)).toBeNull()
  })
})
