import { describe, expect, it } from 'vitest'
import * as z from 'zod/v4'
import { MCP_TOOL_DEFS } from '../../mcp/full-catalog'

const passPredict = MCP_TOOL_DEFS.find((tool) => tool.name === 'pass_predict')
if (!passPredict) throw new Error('pass_predict MCP tool is missing')

const schema = z.object(passPredict.inputSchema)

describe('pass_predict MCP input domain', () => {
  it('requires a positive orbital period', () => {
    expect(schema.safeParse({ period_s: 0 }).success).toBe(false)
    expect(schema.safeParse({ period_s: -1 }).success).toBe(false)
    expect(schema.safeParse({ period_s: 1 }).success).toBe(true)
  })

  it('keeps the optional visible fraction within [0, 1]', () => {
    expect(schema.safeParse({ period_s: 5600, visible_frac: -0.1 }).success).toBe(false)
    expect(schema.safeParse({ period_s: 5600, visible_frac: 1.5 }).success).toBe(false)
    expect(schema.safeParse({ period_s: 5600, visible_frac: 0 }).success).toBe(true)
    expect(schema.safeParse({ period_s: 5600, visible_frac: 1 }).success).toBe(true)
  })

  it('preserves the explicit fraction estimate and its default', () => {
    expect(passPredict.run({ period_s: 5600, visible_frac: 0.1 })).toEqual({
      period_s: 5600,
      rough_pass_s: 560,
      note: 'Full AOS/LOS search in UI pass-predict tool',
    })
    expect(passPredict.run({ period_s: 5600, visible_frac: 0 })).toMatchObject({ rough_pass_s: 0 })
    expect(passPredict.run({ period_s: 5600, visible_frac: 1 })).toMatchObject({ rough_pass_s: 5600 })
    expect(passPredict.run({ period_s: 5600 })).toMatchObject({ rough_pass_s: 560 })
  })
})
