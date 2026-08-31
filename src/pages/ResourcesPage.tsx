import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { RESOURCES } from '@/data/resources'
import { SCENES, sceneCitations, sceneHref } from '@/data/scenes'
import { SeoHead } from '@/components/site/SeoHead'
import { EditOnGitHub } from '@/components/site/EditOnGitHub'

export function ResourcesPage() {
  const { t } = useTranslation()

  return (
    <div className="sidus-enter page-shell page-y">
      <SeoHead
        title="Resources · SIDUS"
        description="Public data sources, textbooks, TLE catalogs, and open references used by SIDUS space engineering tools."
        path="/resources"
      />
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">
            {t('resources.kicker')}
          </p>
          <EditOnGitHub path="src/data/resources.ts" />
        </div>
        <h1
          className="mt-2 font-display font-semibold tracking-tight text-fg"
          style={{ fontSize: 'var(--section-title)' }}
        >
          {t('resources.title')}
        </h1>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-muted sm:text-base">
          {t('resources.subtitle')}
        </p>
      </div>

      <section className="mb-8 sm:mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">
          {t('scenes.kicker')}
        </p>
        <h2 className="mt-2 font-display font-semibold tracking-tight text-fg text-xl">
          {t('scenes.title')}
        </h2>
        <p className="prose-measure mt-3 text-sm leading-relaxed text-muted">
          {t('scenes.subtitle')}
        </p>
        <ul className="grid-auto-tools mt-6 list-none p-0">
          {SCENES.map((scene) => (
            <li key={scene.id} className="sidus-card flex flex-col p-5 sm:p-6">
              <h3 className="font-display text-base font-medium text-fg">{t(scene.titleKey)}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{t(scene.blurbKey)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Link
                  to={sceneHref(scene)}
                  className="inline-flex h-8 items-center border border-border-strong bg-bg-elevated px-2.5 font-mono text-[10px] uppercase tracking-wider text-muted no-underline hover:border-muted hover:text-fg"
                >
                  {t('scenes.open')}
                </Link>
                {sceneCitations(scene).map(({ group, url }) => (
                  <a
                    key={group}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-subtle hover:text-fg"
                  >
                    {t('scenes.cite')} · {t(`fields.sat_group_${group}`)}
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ul className="grid-auto-tools list-none p-0">
        {RESOURCES.map((r) => (
          <li
            key={r.url}
            className="sidus-card flex min-h-[10rem] flex-col p-5 transition-colors hover:border-border-strong hover:bg-surface-hover sm:p-6"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="font-display text-base font-medium text-fg no-underline hover:text-signal"
              >
                {r.name}
              </a>
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-subtle" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
              {r.org}
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{r.description}</p>
            {r.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1 border-t border-border pt-3">
                {r.tags.map((tg) => (
                  <span
                    key={tg}
                    className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted"
                  >
                    {tg}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
