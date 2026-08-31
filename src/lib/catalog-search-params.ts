import { serializeCatalogTags } from './catalog-tags'

export type CatalogParamsPatch = { q?: string; tags?: string[] | null }

/**
 * Next catalog URL params: raw `q` is kept verbatim (spaces included) and
 * only dropped when blank; legacy `tag`/`cat` keys are removed.
 */
export function applyCatalogParamsPatch(
  prev: URLSearchParams,
  patch: CatalogParamsPatch,
): URLSearchParams {
  const next = new URLSearchParams(prev)
  next.delete('cat')
  next.delete('tag')
  if ('q' in patch) {
    const raw = patch.q ?? ''
    if (raw.trim()) next.set('q', raw)
    else next.delete('q')
  }
  if ('tags' in patch) {
    const list = patch.tags ?? []
    if (list.length === 0) next.delete('tags')
    else next.set('tags', serializeCatalogTags(list))
  }
  return next
}
