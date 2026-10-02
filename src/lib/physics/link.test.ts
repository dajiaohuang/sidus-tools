import { describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../../../mcp/full-catalog'
import { linkBudget } from './link'

const baseInput = {
  ptW: 1,
  gtDbi: 0,
  grDbi: 0,
  freqHz: 1e9,
  rangeM: 1000,
  tSysK: 290,
  requiredCn0DbHz: 50,
}

describe('linkBudget', () => {
  it('rejects negative or non-finite extra loss', () => {
    for (const otherLossDb of [-20, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(linkBudget({ ...baseInput, otherLossDb })).toBeNull()
    }
  })

  it('rejects invalid extra loss through the MCP schema and adapter', () => {
    const tool = MCP_TOOL_DEFS.find((definition) => definition.name === 'link_budget')!
    const extraLoss = tool.inputSchema.other_loss_db

    expect(extraLoss.safeParse(0).success).toBe(true)
    for (const value of [-20, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(extraLoss.safeParse(value).success).toBe(false)
      expect(
        tool.run({
          pt_w: 1,
          gt_dbi: 0,
          gr_dbi: 0,
          freq_hz: 1e9,
          range_m: 1000,
          other_loss_db: value,
          t_sys_k: 290,
          required_cn0_dbhz: 50,
        }),
      ).toBeNull()
    }
  })

  it('applies valid nonnegative extra loss in dB to power, C/N0, and margin', () => {
    const noExtraLoss = linkBudget({ ...baseInput, otherLossDb: 0 })
    const twentyDbLoss = linkBudget({ ...baseInput, otherLossDb: 20 })

    expect(noExtraLoss?.prDbw).toBeCloseTo(-92.44, 10)
    expect(twentyDbLoss?.prDbw).toBeCloseTo(-112.44, 10)
    expect(twentyDbLoss?.cn0DbHz).toBeCloseTo(noExtraLoss!.cn0DbHz! - 20, 10)
    expect(twentyDbLoss?.marginDb).toBeCloseTo(noExtraLoss!.marginDb! - 20, 10)
  })
})
