import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { UiField } from '@/components/shared/UiField'
import { UiUnitField } from '@/components/shared/UiUnitField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import {
  TOOL_UNIT_SETS,
  toSi,
  dopplerShiftHz,
  twoWayDopplerHz,
  rangeRateFromClockOffset,
} from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, strParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  f0: numParam(2200000000, { min: 1 }),
  vr: numParam(1000),
  vru: strParam('mps', TOOL_UNIT_SETS.velocity),
  dff: numParam(0),
} as const

export function DopplerShiftLeoTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const res = useMemo(() => {
    const vr = toSi(p.vr, p.vru)
    const fd = dopplerShiftHz(p.f0, vr)
    const fd2 = twoWayDopplerHz(p.f0, vr)
    const rdot = rangeRateFromClockOffset(p.dff)
    if (fd == null || fd2 == null || rdot == null) return null
    return { fd, fd2, rdot }
  }, [p])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiField
            label={t('fields.disc_f0')}
            type="number"
            min={1}
            step="any"
            value={p.f0}
            onChange={(e) => setP({ f0: Number(e.target.value) })}
          />
          <UiUnitField
            label={t('fields.disc_vr')}
            category="velocity"
            unitIds={TOOL_UNIT_SETS.velocity}
            unitId={p.vru}
            value={p.vr}
            onValueChange={(vr) => setP({ vr })}
            onUnitChange={(vru, vr) => setP({ vru, vr })}
          />
          <UiField
            label={t('fields.clock_frac_freq')}
            type="number"
            step="any"
            value={p.dff}
            onChange={(e) => setP({ dff: Number(e.target.value) })}
            hint={t('fields.hint_clock_frac')}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.disc_fd')} value={formatNumber(res.fd, 4)} unit="Hz" accent />
            <ResultCard label={t('fields.two_way_doppler')} value={formatNumber(res.fd2, 4)} unit="Hz" />
            <ResultCard
              label={t('fields.range_rate_error')}
              si={res.rdot}
              category="velocity"
              unitId="mps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={6}
            />
          </div>
        )
      }
      code={
        <CodeExport
          formulaId="doppler-shift-leo"
          values={{ ...p, vr: toSi(p.vr, p.vru) }}
        />
      }
    />
  )
}
