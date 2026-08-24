import { describe, expect, it } from 'vitest'
import { sceneChipAction } from './scene'

describe('sceneChipAction', () => {
  it('ignores the chip you are already on', () => {
    expect(sceneChipAction('globe', 'globe', true)).toBe('ignore')
    expect(sceneChipAction('solar', 'solar', false)).toBe('ignore')
  })

  it('always flies OUT, because the globe is always able to hand over', () => {
    expect(sceneChipAction('solar', 'globe', false)).toBe('flyOut')
    expect(sceneChipAction('solar', 'globe', true)).toBe('flyOut')
  })

  it('flies back IN when the globe left a scale to aim at', () => {
    expect(sceneChipAction('globe', 'solar', true)).toBe('flyIn')
  })

  it('SWITCHES back when it did not, instead of asking for an impossible flight', () => {
    /*
     * Opening `?scene=solar` from a link means the globe never ran and never
     * recorded the scale a return flight aims at: the fly-in effect would
     * give up on its first line and the chip would be a one-way door.
     * Switching is the only action that always works from that state.
     */
    expect(sceneChipAction('globe', 'solar', false)).toBe('switch')
  })

  it('never leaves a press with nothing to do', () => {
    for (const target of ['globe', 'solar'] as const) {
      for (const current of ['globe', 'solar'] as const) {
        for (const handoff of [true, false]) {
          const action = sceneChipAction(target, current, handoff)
          if (target === current) continue
          expect(action).not.toBe('ignore')
        }
      }
    }
  })
})
