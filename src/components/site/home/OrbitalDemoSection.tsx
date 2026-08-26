/**
 * Cinematic live globe under the hero: attract-mode auto-rotation, a real
 * satellite swarm and its trails, day-night shading, all click-through to the
 * orbital view tool. The globe chunk (MapLibre included) only loads once the
 * section nears the viewport, so the home's first paint pays nothing for it.
 *
 * Layout: stacked (globe under the copy) on small screens; two columns with
 * the globe on the right from `lg`; on very wide viewports the globe sits in
 * the centre column so it does not drift to the far edge.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { AsciiOrbitField } from '@/components/site/AsciiOrbitField'
import { utcStamp } from '@/components/tools/orbital-view/clock'

const LazyOrbitalDemoGlobe = lazy(() => import('./OrbitalDemoGlobe'))

/** Starts loading the globe chunk well before it scrolls into view. */
const ACTIVATE_ROOT_MARGIN = '400px'
const CLOCK_TICK_MS = 1000

function OrbitalDemoClock() {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{utcStamp(nowMs)}</span>
}

export function OrbitalDemoSection() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    /* Reduced motion never activates the globe: attract-mode rotation and a
       live swarm are exactly the motion that setting asks pages to skip. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setActive(true)
          observer.disconnect()
        }
      },
      { rootMargin: ACTIVATE_ROOT_MARGIN },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const poster = (
    <div className="absolute inset-0 flex items-center justify-center bg-bg">
      <AsciiOrbitField density={0.9} opacity={0.35} />
      <p className="relative z-[1] font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">
        {t('home.orbital_loading')}
      </p>
    </div>
  )

  const meta = active ? (
    <p className="mt-1 font-mono text-[10px] tracking-wider text-muted">
      <OrbitalDemoClock />
    </p>
  ) : null

  const copy = (
    <div className="max-w-xl min-[120rem]:max-w-none">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">
        {t('home.section.demo_kicker')}
      </p>
      {meta}
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        {t('home.orbital_title')}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        {t('home.orbital_body')}
      </p>
      <span className="mt-6 inline-flex h-12 items-center gap-2 bg-accent px-7 font-display text-sm font-medium tracking-wide text-accent-fg">
        {t('home.orbital_cta')}
        <ArrowRight className="size-4" />
      </span>
    </div>
  )

  const globe = (
    <div className="pointer-events-none absolute inset-0">
      {active ? (
        <Suspense fallback={poster}>
          <LazyOrbitalDemoGlobe />
        </Suspense>
      ) : (
        poster
      )}
    </div>
  )

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-b border-border bg-bg"
    >
      <div
        className="
          page-shell relative z-[2] py-8 sm:py-10
          lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:py-12
          xl:gap-12 xl:py-14
          min-[120rem]:grid-cols-[1fr_minmax(28rem,40rem)_1fr] min-[120rem]:gap-8
        "
      >
        <div className="relative z-[2] min-[120rem]:col-start-1">{copy}</div>
        <div
          className="
            relative mt-6 aspect-[4/3] min-h-[16rem] w-full overflow-hidden
            sm:aspect-[16/10] sm:min-h-[20rem]
            lg:mt-0 lg:aspect-square lg:min-h-[22rem] lg:max-h-[min(70vh,36rem)]
            min-[120rem]:col-start-2 min-[120rem]:max-h-[min(64vh,40rem)]
          "
        >
          {globe}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 sm:h-36 lg:h-24"
            style={{
              background:
                'linear-gradient(to top, var(--color-bg) 0%, color-mix(in oklab, var(--color-bg) 55%, transparent) 42%, transparent 100%)',
            }}
          />
        </div>
      </div>

      <Link to="/tools/orbital-view" aria-label={t('home.orbital_cta')} className="absolute inset-0 z-[3]" />
    </section>
  )
}
