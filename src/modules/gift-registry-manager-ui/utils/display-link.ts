const cacheKey = (eventId: string) => `gift-registry:display-link:${eventId}`

/** Only reuse this application's full fragment link; storage may be unavailable in private browser contexts. */
export function readDisplayLink(eventId: string): string {
  try {
    const raw = localStorage.getItem(cacheKey(eventId))
    if (!raw) return ''
    const url = new URL(raw)
    if (
      url.origin !== window.location.origin ||
      !url.pathname.endsWith(
        `/gift-registry/display/${encodeURIComponent(eventId)}`,
      ) ||
      !new URLSearchParams(url.hash.slice(1)).get('token')
    )
      return ''
    return url.toString()
  } catch {
    return ''
  }
}

/** A cache write failure must not discard a successfully issued link or cause another token issuance. */
export function cacheDisplayLink(eventId: string, link: string): void {
  try {
    localStorage.setItem(cacheKey(eventId), link)
  } catch {
    // The caller retains the link in memory when browser storage is disabled or full.
  }
}

/** A deleted activity must not retain an actionable display link in this browser. */
export function removeDisplayLink(eventId: string): void {
  try {
    localStorage.removeItem(cacheKey(eventId))
  } catch {
    /* Storage can be unavailable. */
  }
  try {
    sessionStorage.removeItem(`gift-registry:display:${eventId}`)
  } catch {
    /* Storage can be unavailable. */
  }
}
