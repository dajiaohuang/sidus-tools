import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../../../mcp/full-catalog'

describe('MCP zero-delta-v propulsion boundaries', () => {
  it('propellant_mass accepts zero delta-v and returns no propellant', () => {
    const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'propellant_mass')!
    const args = { isp_s: 320, delta_v_m_s: 0, dry_mass_kg: 5000 }

    expect(
      Object.entries(tool.inputSchema).every(
        ([key, schema]) => schema.safeParse(args[key as keyof typeof args]).success,
      ),
    ).toBe(true)
    expect(tool.run(args)).toEqual({ m0: 5000, prop: 0, ratio: 1 })
  })

  it('equal_stage accepts zero total delta-v and returns unit stage mass ratio', () => {
    const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'equal_stage')!
    const args = { total_dv_m_s: 0, n_stages: 3, isp_s: 300 }

    expect(
      Object.entries(tool.inputSchema).every(
        ([key, schema]) => schema.safeParse(args[key as keyof typeof args]).success,
      ),
    ).toBe(true)
    expect(tool.run(args)).toEqual({ dvStage: 0, massRatio: 1, ve: 300 * 9.80665 })
  })
})
