import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { UiField } from '@/components/shared/UiField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { TOOL_UNIT_SETS, allanRangeRateSigma } from '@/lib/physics'
import { numParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  sy: numParam(1e-13, { min: 0 }),
} as const

export function AllanRangeRateTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const res = useMemo(() => allanRangeRateSigma(p.sy), [p.sy])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiField
            label={t('fields.allan_sigma_y')}
            type="number"
            min={0}
            step="any"
            value={p.sy}
            onChange={(e) => setP({ sy: Number(e.target.value) })}
            hint={t('fields.hint_allan')}
          />
        </ParamsGrid>
      }
      results={
        res == null ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard
              label={t('fields.allan_range_rate')}
              si={res}
              category="velocity"
              unitId="mps"
              unitIds={TOOL_UNIT_SETS.velocity}
              digits={6}
              accent
            />
          </div>
        )
      }
      code={<CodeExport formulaId="allan-range-rate" values={{ sy: p.sy }} />}
    />
  )
}
