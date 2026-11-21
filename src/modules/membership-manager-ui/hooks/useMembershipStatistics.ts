import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { membershipApi } from '../api'
import type { MembershipStatistics } from '../types'

/** Statistics belong to the current query-enabled account and never survive its scope. */
export function useMembershipStatistics() {
  const session = useSession()
  const permissions = usePermissions()
  const data = shallowRef<MembershipStatistics>()
  const loading = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  let active = true
  function clear() {
    controller?.abort()
    controller = undefined
    data.value = undefined
    loading.value = false
    error.value = ''
  }
  async function load() {
    clear()
    if (
      !active ||
      !session.user?.id ||
      !permissions.can('membership-admin:query')
    )
      return
    const userId = session.user.id
    const current = new AbortController()
    controller = current
    loading.value = true
    try {
      const result = await membershipApi.statistics({
        signal: current.signal,
        silent: true,
      })
      if (
        !current.signal.aborted &&
        userId === session.user?.id &&
        permissions.can('membership-admin:query')
      )
        data.value = result
    } catch (cause) {
      if (
        !current.signal.aborted &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value = t('membership.statisticsFailed')
    } finally {
      if (controller === current) loading.value = false
    }
  }
  watch(
    () => [session.user?.id, permissions.can('membership-admin:query')],
    () => void load(),
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    active = false
    clear()
  })
  return { data, loading, error, load }
}
