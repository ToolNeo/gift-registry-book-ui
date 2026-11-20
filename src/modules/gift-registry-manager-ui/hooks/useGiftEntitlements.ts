import { computed, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { useResource } from '@/shared/composables/useResource'
import { useMembershipLifecycle } from '@/modules/membership-manager-ui'
import { giftApi } from '../api'
import type { GiftUsage } from '../types'

/** Quotas come from unfiltered server counts; feature access also requires its independent action. */
export function useGiftEntitlements(eventId: Ref<string>) {
  const permissions = usePermissions()
  const session = useSession()
  const membership = useMembershipLifecycle(() => usage.load())
  const usage = useResource<GiftUsage | undefined>(async (signal) => {
    const userId = session.user?.id
    const result = await giftApi.usage(eventId.value || undefined, {
      signal,
      silent: true,
    })
    if (signal.aborted || userId !== session.user?.id)
      throw new ApiError('', 0, undefined, undefined, undefined, true)
    // Actor membership travels with the gift permission, independently of the optional member-center menu.
    membership.accept(result.membership)
    return result
  }, undefined)
  const canCreateEvent = computed(
    () =>
      permissions.can('gift-registry:save') &&
      !!usage.data.value?.canCreateEvent,
  )
  const canCreateEntry = computed(
    () =>
      permissions.can('gift-registry:save') &&
      !!usage.data.value?.canCreateEntry,
  )
  const canExport = computed(
    () =>
      permissions.can('gift-registry:query') &&
      permissions.can('gift-registry:export') &&
      membership.unlimited,
  )
  const canBackup = computed(
    () =>
      permissions.can('gift-registry:query') &&
      permissions.can('gift-registry:backup') &&
      membership.unlimited,
  )
  const canRestore = computed(
    () =>
      permissions.can('gift-registry:save') &&
      permissions.can('gift-registry:restore') &&
      membership.unlimited,
  )
  watch(eventId, () => {
    usage.data.value = undefined
    void usage.load()
  })
  watch(
    () => session.user?.id,
    (userId) => {
      usage.data.value = undefined
      if (userId) void usage.load()
    },
    { flush: 'sync' },
  )
  watch(
    () => membership.unlimited,
    () => void usage.load(),
  )
  async function refresh() {
    await Promise.all([usage.load(), membership.load()])
  }
  return {
    membership,
    usage,
    canCreateEvent,
    canCreateEntry,
    canExport,
    canBackup,
    canRestore,
    refresh,
  }
}
