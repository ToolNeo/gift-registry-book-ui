import { onScopeDispose, ref, watch, type ShallowRef } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import { membershipApi } from '../api'
import type { CodeDelivery, IssueResult } from '../types'

/** Poll only while the one-time modal is open; closing it never cancels server delivery. */
export function useCodeDelivery(
  issued: ShallowRef<IssueResult | undefined>,
  onUpdate: (delivery: CodeDelivery) => void,
) {
  const error = ref('')
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let notified: string | undefined
  function clear() {
    clearTimeout(timer)
    controller?.abort()
    loading.value = false
    error.value = ''
  }
  function schedule() {
    if (issued.value?.authorization.deliveryStatus === 'SENDING')
      timer = setTimeout(() => void refresh(), 1500)
  }
  function notify() {
    const code = issued.value?.authorization
    if (code?.deliveryStatus === 'SENT' && notified !== code.id) {
      notified = code.id
      void saved(t('membership.emailSent'))
    }
  }
  async function refresh() {
    clear()
    const result = issued.value
    if (!result?.code || result.authorization.deliveryStatus !== 'SENDING')
      return
    const current = new AbortController()
    controller = current
    loading.value = true
    try {
      const status = await membershipApi.delivery(result.authorization.id, {
        signal: current.signal,
        silent: true,
      })
      if (
        current.signal.aborted ||
        issued.value?.authorization.id !== status.codeId
      )
        return
      issued.value = {
        ...result,
        authorization: {
          ...result.authorization,
          recipientEmail: status.recipientEmail,
          deliveryStatus: status.deliveryStatus,
        },
      }
      onUpdate(status)
      notify()
    } catch (cause) {
      if (
        !current.signal.aborted &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value = t('membership.deliveryQueryFailed')
    } finally {
      if (controller === current && !current.signal.aborted) {
        loading.value = false
        schedule()
      }
    }
  }
  watch(
    () => issued.value?.authorization.id,
    () => {
      clear()
      notified = undefined
      notify()
      schedule()
    },
    { flush: 'sync' },
  )
  onScopeDispose(clear)
  return { error, loading, refresh }
}
