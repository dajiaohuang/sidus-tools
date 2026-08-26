import { useEffect, useState } from 'react'

/** Below `lg`: floating globe chrome no longer fits beside the planet. */
const COMPACT_QUERY = '(max-width: 1023px)'

/**
 * True when orbital-view chrome should collapse into the dock + sheets.
 * Reads the viewport, not a user preference: the panels simply do not fit.
 */
export function useCompactChrome(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(COMPACT_QUERY).matches,
  )
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY)
    const sync = () => setCompact(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return compact
}
