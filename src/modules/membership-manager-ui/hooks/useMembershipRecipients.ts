import { onScopeDispose, ref, shallowRef } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { membershipApi } from '../api'
import type { MembershipRecipient } from '../types'

/** Only the latest open-dialog search may expose a recipient's verified binding. */
export function useMembershipRecipients(enabled: () => boolean) {
  const rows = shallowRef<MembershipRecipient[]>([])
  const selected = shallowRef<MembershipRecipient>()
  const loading = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  function clear() {
    controller?.abort()
    rows.value = []
    selected.value = undefined
    loading.value = false
    error.value = ''
  }
  async function search(value: string) {
    clear()
    const search = value.trim()
    if (!enabled() || !search) return
    if (search.length > 64) {
      error.value = t('membership.recipientSearchLimit')
      return
    }
    const current = new AbortController()
    controller = current
    loading.value = true
    try {
      const result = await membershipApi.recipients(search, {
        signal: current.signal,
        silent: true,
      })
      if (!current.signal.aborted && enabled()) rows.value = result
    } catch (cause) {
      if (
        !current.signal.aborted &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value =
          cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (controller === current) loading.value = false
    }
  }
  function select(value: unknown) {
    selected.value = rows.value.find((item) => item.username === value)
  }
  onScopeDispose(clear)
  return { rows, selected, loading, error, search, select, clear }
}
