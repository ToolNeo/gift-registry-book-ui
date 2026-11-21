import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { ServerMenu } from '@/shared/auth/types'
import { membershipApi } from '../api'
import type { MembershipPackage, MembershipStatus } from '../types'

/** Account-scoped entitlement cache; server time controls expiry, never local roles or list totals. */
export const useMembership = defineStore('membership', () => {
  const session = useSession()
  const status = shallowRef<MembershipStatus>()
  const packages = shallowRef<MembershipPackage[]>([])
  const loading = ref(false)
  const error = ref('')
  const clock = ref(0)
  let offset = 0
  let generation = 0
  let controller: AbortController | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const unlimited = computed(() => {
    const current = status.value
    return (
      !!current?.unlimited &&
      (current.state === 'EXEMPT' ||
        (current.expiresAt != null && current.expiresAt > clock.value))
    )
  })
  function clear() {
    generation++
    controller?.abort()
    clearTimeout(expiryTimer)
    status.value = undefined
    packages.value = []
    error.value = ''
    loading.value = false
  }
  // Logout and switching accounts invalidate even late responses from the previous identity.
  watch(() => session.user?.id, clear, { flush: 'sync' })
  function accept(value: MembershipStatus) {
    clearTimeout(expiryTimer)
    offset = value.serverTime - Date.now()
    clock.value = value.serverTime
    status.value = value
    const remaining = (value.expiresAt ?? 0) - clock.value
    if (value.state === 'VIP' && remaining > 0) {
      expiryTimer = setTimeout(
        () => {
          clock.value = Date.now() + offset
          void load()
        },
        Math.min(remaining + 20, 2_147_483_647),
      )
    }
  }
  async function load() {
    if (!session.user?.id || !session.can('membership:query')) return
    controller?.abort()
    const current = new AbortController()
    controller = current
    const epoch = ++generation
    const userId = session.user.id
    loading.value = true
    error.value = ''
    clock.value = Date.now() + offset
    try {
      const options = { signal: current.signal, silent: true }
      const [membership, available] = await Promise.all([
        membershipApi.me(options),
        membershipApi.packages(options),
      ])
      if (epoch !== generation || session.user?.id !== userId) return
      packages.value = available
      accept(membership)
    } catch (cause) {
      if (
        epoch === generation &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value =
          cause instanceof Error ? cause.message : t('membership.queryFailed')
    } finally {
      if (epoch === generation) loading.value = false
    }
  }
  const centerPath = computed(() => {
    function find(nodes: ServerMenu[]): string | undefined {
      for (const node of nodes) {
        if (node.granted === false || node.options?.show === false) continue
        if (
          (node.componentCode || node.code) === 'membership/Center' &&
          node.url?.startsWith('/')
        )
          return node.url
        const child = find(node.children || [])
        if (child) return child
      }
    }
    return find(session.menus)
  })
  const currentTime = () => Date.now() + offset
  return {
    status,
    packages,
    loading,
    error,
    unlimited,
    centerPath,
    load,
    accept,
    clear,
    currentTime,
  }
})
