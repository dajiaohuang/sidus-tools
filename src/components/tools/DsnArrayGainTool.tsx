import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '@/components/shared/ToolShell'
import { ParamsGrid } from '@/components/shared/ParamsGrid'
import { UiField } from '@/components/shared/UiField'
import { ResultCard } from '@/components/shared/ResultCard'
import { CodeExport } from '@/components/shared/CodeExport'
import { dsnArraySnrGain } from '@/lib/physics'
import { formatNumber } from '@/lib/physics/format'
import { numParam, useToolSearchParams } from '@/lib/use-tool-search-params'

const SCHEMA = {
  n: numParam(4, { min: 1 }),
} as const

export function DsnArrayGainTool() {
  const { t } = useTranslation()
  const [p, setP] = useToolSearchParams(SCHEMA)
  const res = useMemo(() => dsnArraySnrGain(p.n), [p.n])

  return (
    <ToolShell
      parameters={
        <ParamsGrid>
          <UiField
            label={t('fields.n_antennas')}
            type="number"
            min={1}
            step={1}
            value={p.n}
            onChange={(e) => setP({ n: Number(e.target.value) })}
            hint={t('fields.hint_dsn_array')}
          />
        </ParamsGrid>
      }
      results={
        !res ? (
          <p className="font-mono text-sm text-muted">{t('fields.invalid_params')}</p>
        ) : (
          <div className="sidus-results">
            <ResultCard label={t('fields.array_snr_lin')} value={formatNumber(res.gainLin, 4)} accent />
            <ResultCard label={t('fields.array_snr_db')} value={formatNumber(res.gainDb, 4)} unit="dB" />
          </div>
        )
      }
      code={<CodeExport formulaId="dsn-array-gain" values={{ n: p.n }} />}
    />
  )
}
