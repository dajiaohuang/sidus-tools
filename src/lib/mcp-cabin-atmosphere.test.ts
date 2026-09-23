import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

describe('cabin_atmosphere MCP input contract', () => {
  const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'cabin_atmosphere')!

  it('rejects relative humidity outside 0–1 at the schema boundary', () => {
    expect(tool.inputSchema.relative_humidity.safeParse(1.2).success).toBe(false)
  })

  it('rejects a CO2 partial pressure that exceeds total cabin pressure', () => {
    expect(
      tool.run({
        volume_m3: 10,
        temp_k: 293.15,
        pressure_pa: 100_000,
        dry_o2_frac: 0.21,
        pp_co2_pa: 200_000,
        relative_humidity: 0,
      }),
    ).toBeNull()
  })
})
