import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { useQueryList } from '@/shared/composables/useQueryList'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import { giftApi, type GiftUsage } from '@/modules/gift-registry-manager-ui'
import { membershipApi } from '../api'
import { useMembershipLifecycle } from './useMembershipLifecycle'

export function useMembershipCenter() {
  const session = useSession()
  const membership = useMembershipLifecycle()
  const history = useQueryList(membershipApi.history)
  const usage = useResource<GiftUsage | undefined>(
    (signal) => giftApi.usage(undefined, { signal, silent: true }),
    undefined,
  )
  const task = useTask()
  const draft = reactive({ code: '' })
  const refreshWarning = ref('')
  const remainingSeconds = ref(0)
  let countdownTimer: ReturnType<typeof setInterval> | undefined
  const timeRemaining = computed(() => {
    if (
      membership.status?.state !== 'VIP' ||
      membership.status.expiresAt == null
    )
      return null
    const seconds = remainingSeconds.value
    return {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    }
  })
  function updateRemaining() {
    // Recompute against corrected wall time so a suspended tab catches up on its next tick.
    remainingSeconds.value = Math.max(
      0,
      Math.ceil(
        ((membership.status?.expiresAt ?? 0) - membership.currentTime()) / 1000,
      ),
    )
    if (!remainingSeconds.value) clearInterval(countdownTimer)
  }
  watch(
    () => membership.status,
    (status) => {
      clearInterval(countdownTimer)
      remainingSeconds.value = 0
      if (status?.state === 'VIP' && status.expiresAt != null) {
        updateRemaining()
        if (remainingSeconds.value)
          countdownTimer = setInterval(updateRemaining, 1000)
      }
    },
    { immediate: true, flush: 'sync' },
  )
  let pending: { code: string; requestId: string } | undefined
  let active = true
  onBeforeUnmount(() => {
    active = false
    clearInterval(countdownTimer)
  })
  async function redeem() {
    if (!session.can('membership:redeem') || !draft.code.trim()) return
    await task.run(async () => {
      const userId = session.user?.id
      const code = draft.code.trim()
      if (pending?.code !== code)
        pending = { code, requestId: crypto.randomUUID() }
      const result = await membershipApi.redeem(code, pending.requestId)
      if (!active || userId !== session.user?.id) return
      membership.accept(result)
      draft.code = ''
      pending = undefined
      void saved(t('membership.redeemed'))
      // A refresh error after a committed redemption must not invite a second redemption.
      const results = await Promise.allSettled([
        session.refreshAuthorization(),
        history.load(),
        usage.load(),
      ])
      refreshWarning.value =
        results.some((item) => item.status === 'rejected') ||
        history.error.value ||
        usage.error.value
          ? t('membership.refreshFailed')
          : ''
    })
  }
  async function refresh() {
    refreshWarning.value = ''
    await Promise.all([membership.load(), usage.load(), history.load()])
  }
  onMounted(() => void usage.load())
  return {
    membership,
    history,
    usage,
    task,
    draft,
    refreshWarning,
    timeRemaining,
    redeem,
    refresh,
  }
}
