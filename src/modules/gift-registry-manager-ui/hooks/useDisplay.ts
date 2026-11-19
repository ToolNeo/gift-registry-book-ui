import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { displayApi } from '../api'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { DisplaySnapshot } from '../types'

/** Poll one read-only event version and fetch canonical pages only when needed. */
export function useDisplay(
  eventId: Ref<string>,
  accessToken: Ref<string>,
  pageSize: Ref<number> = ref(24),
) {
  const snapshot = shallowRef<DisplaySnapshot>()
  const loading = ref(false)
  const error = ref('')
  const disconnected = ref(false)
  let controller: AbortController | undefined
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let scope = 0
  let generation = 0
  let terminal = false
  let stopped = false

  function clearPoll() {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }

  /** Schedule after completion so slow requests never overlap the next poll. */
  function schedulePoll(epoch: number) {
    if (
      stopped ||
      terminal ||
      epoch !== scope ||
      !eventId.value ||
      !accessToken.value
    )
      return
    pollTimer = setTimeout(() => {
      pollTimer = undefined
      void sync(false)
    }, 2000)
  }

  /** Manual pages cancel older requests; only a higher committed sequence follows the tail. */
  async function sync(force = true, pageIndex?: number) {
    if (stopped || terminal) return
    clearPoll()
    controller?.abort()
    const current = new AbortController()
    controller = current
    const request = ++generation
    const epoch = scope
    const id = eventId.value
    const credential = accessToken.value
    if (!credential || !id) {
      loading.value = false
      error.value = t('gift.noToken')
      return
    }
    loading.value = !snapshot.value
    try {
      const signal = current.signal
      const previous = snapshot.value
      if (!force) {
        const result = await displayApi.version(id, credential, signal)
        if (request !== generation || epoch !== scope || stopped) return
        // A successful probe after an outage still reloads the retained picture.
        if (result.version === previous?.version && !disconnected.value) {
          error.value = ''
          return
        }
      }
      let result = await displayApi.snapshot(
        id,
        credential,
        pageIndex ?? previous?.pageIndex ?? -1,
        signal,
        pageSize.value,
      )
      if (request !== generation || epoch !== scope || stopped) return
      const lastPage = Math.max(
        0,
        Math.ceil(result.total / result.pageSize) - 1,
      )
      const newRows =
        previous && result.latestEntrySeq > previous.latestEntrySeq
      const target =
        pageIndex === undefined && newRows
          ? lastPage
          : Math.min(result.pageIndex, lastPage)
      if (target !== result.pageIndex)
        result = await displayApi.snapshot(
          id,
          credential,
          // A concurrent registration may have moved the tail after the first snapshot.
          pageIndex === undefined && newRows ? -1 : target,
          signal,
          pageSize.value,
        )
      if (request !== generation || epoch !== scope || stopped) return
      snapshot.value = result
      disconnected.value = false
      error.value = ''
    } catch (cause) {
      if (
        request !== generation ||
        epoch !== scope ||
        stopped ||
        current.signal.aborted ||
        (cause instanceof ApiError && cause.cancelled)
      )
        return
      error.value =
        cause instanceof Error ? cause.message : t('gift.requestFailed')
      disconnected.value = true
      // Revoked or missing read-only access must clear the picture and stop polling.
      if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
        terminal = true
        snapshot.value = undefined
      }
    } finally {
      if (request === generation && epoch === scope && !stopped) {
        loading.value = false
        schedulePoll(epoch)
      }
    }
  }

  watch(
    [eventId, accessToken],
    () => {
      scope++
      generation++
      controller?.abort()
      clearPoll()
      snapshot.value = undefined
      terminal = false
      error.value = ''
      disconnected.value = false
      void sync()
    },
    { immediate: true },
  )

  // Resizing keeps the first visible record on screen while the server applies the configured column cap.
  watch(pageSize, () => {
    const previous = snapshot.value
    const target = previous
      ? Math.floor(
          (previous.pageIndex * previous.pageSize) /
            Math.min(pageSize.value, previous.settings.columnsPerPage),
        )
      : undefined
    void sync(true, target)
  })
  onBeforeUnmount(() => {
    stopped = true
    scope++
    generation++
    controller?.abort()
    clearPoll()
  })
  return { snapshot, loading, error, disconnected, sync }
}
