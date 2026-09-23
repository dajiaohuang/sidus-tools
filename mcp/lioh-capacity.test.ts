import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from './full-catalog'
import { LIOH_THEORETICAL_CO2_CAPACITY } from '../src/lib/physics/eclss'

describe('LiOH MCP capacity domain', () => {
  const tool = MCP_TOOL_DEFS.find((entry) => entry.name === 'lioh_scrubber')!

  it('rejects capacity above stoichiometry and accepts the exact boundary', () => {
    expect(tool.inputSchema.capacity.safeParse(1).success).toBe(false)
    expect(tool.inputSchema.capacity.safeParse(LIOH_THEORETICAL_CO2_CAPACITY).success).toBe(true)
    expect(tool.run({ lioh_kg: 1, co2_rate_kg_s: 1e-5, capacity: 1 })).toBeNull()
  })
})
