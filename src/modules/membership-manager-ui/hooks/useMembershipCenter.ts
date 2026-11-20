import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
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
  let pending: { code: string; requestId: string } | undefined
  let active = true
  onBeforeUnmount(() => {
    active = false
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
    redeem,
    refresh,
  }
}
