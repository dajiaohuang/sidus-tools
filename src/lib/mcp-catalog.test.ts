import { describe, expect, it } from 'vitest'
import { MCP_SAMPLES, MCP_TOOL_DEFS } from '../../mcp/full-catalog'

describe('orbital_energy MCP contract', () => {
  const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'orbital_energy')!

  it('accepts only inputs that determine Keplerian specific energy', () => {
    expect(Object.keys(tool.inputSchema).sort()).toEqual(['a_m', 'mu'])
    expect(MCP_SAMPLES.orbital_energy).toEqual({ a_m: 6_778_137 })
  })

  it('returns the analytic specific-energy value without a redundant radius', () => {
    expect(tool.run({ a_m: 2, mu: 4 })).toEqual({ energy_j_kg: -1 })
  })
})
