import { onBeforeUnmount, ref } from 'vue'
import type {
  EmailCodeChallenge,
  EmailCaptchaProof,
  EmailDeliveryStatus,
} from '@/modules/authentication-manager-ui/types/auth'
import { publicRequest } from '@/shared/api/public-client'
import { useEmailCaptcha } from '@/modules/authentication-manager-ui/hooks/useEmailCaptcha'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { saved } from '@/shared/utils/feedback'

/** One form owns its challenge; closing or changing its email invalidates every pending response. */
export function useEmailCode(
  sender: (signal: AbortSignal, captcha: EmailCaptchaProof) => Promise<EmailCodeChallenge>,
) {
  const captcha = useEmailCaptcha()
  const challengeId = ref(''),
    code = ref(''),
    maskedEmail = ref(''),
    remaining = ref(0),
    busy = ref(false),
    pending = ref(false),
    error = ref('')
  let pendingDelivery: EmailCodeChallenge | undefined
  let generation = 0,
    disposed = false,
    expiresAt = 0,
    active: AbortController | undefined,
    timer: ReturnType<typeof setInterval> | undefined
  function reset() {
    generation++
    active?.abort()
    active = undefined
    clearInterval(timer)
    timer = undefined
    challengeId.value = code.value = maskedEmail.value = error.value = ''
    expiresAt = remaining.value = 0
    busy.value = false
    pending.value = false
    pendingDelivery = undefined
  }
  function cooldown(seconds: number) {
    clearInterval(timer)
    const resendAt = Date.now() + seconds * 1000
    const tick = () => {
      remaining.value = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))
      if (!remaining.value) {
        clearInterval(timer)
        timer = undefined
      }
    }
    tick()
    if (remaining.value) timer = setInterval(tick, 1000)
  }
  function pause(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(waiting)
        signal.removeEventListener('abort', abort)
        reject(new ApiError('', 0, undefined, undefined, undefined, true))
      }
      const waiting = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, 2000)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
  async function delivered(ticket: EmailCodeChallenge, signal: AbortSignal) {
    if (ticket.deliveryStatus !== 'SENDING') return ticket
    pendingDelivery = ticket
    pending.value = true
    const deadline = Date.now() + 150000
    while (Date.now() < deadline && !signal.aborted) {
      await pause(signal)
      let status: EmailDeliveryStatus
      try {
        status = (
          await publicRequest.get<EmailDeliveryStatus>(
            `/authorize/email/code/${encodeURIComponent(ticket.challengeId)}`,
            undefined,
            { signal, silent: true, timeout: 10000 },
          )
        ).result
      } catch (cause) {
        // Retry only the status read. Never issue another email after an uncertain response.
        if (
          cause instanceof ApiError &&
          !cause.cancelled &&
          (cause.status === 0 || cause.status === 429 || cause.status >= 500)
        )
          continue
        throw cause
      }
      if (signal.aborted) throw new ApiError('', 0, undefined, undefined, undefined, true)
      if (status.status === 'SENDING') continue
      pendingDelivery = undefined
      pending.value = false
      if (status.status === 'FAILED') throw new Error(t('auth.emailDeliveryFailed'))
      if (status.status === 'EXPIRED') throw new Error(t('auth.emailDeliveryExpired'))
      if (status.status !== 'SENT' || status.expiresIn <= 0)
        throw new Error(t('auth.emailDeliveryExpired'))
      return {
        ...ticket,
        expiresIn: status.expiresIn,
        deliveryStatus: 'SENT' as const,
      }
    }
    if (signal.aborted) throw new ApiError('', 0, undefined, undefined, undefined, true)
    throw new Error(t('auth.emailDeliveryUnknown'))
  }
  async function send() {
    if (disposed || busy.value || remaining.value > 0) return
    const version = ++generation,
      controller = new AbortController()
    active = controller
    busy.value = true
    error.value = ''
    let attempted = false
    const current = () => !disposed && version === generation && !controller.signal.aborted
    try {
      let ticket = pendingDelivery
      if (!ticket) {
        const imageProof = captcha.proof()
        // A validated image is single-use at the server, even when SMTP delivery fails.
        attempted = true
        challengeId.value = code.value = maskedEmail.value = ''
        expiresAt = 0
        ticket = await sender(controller.signal, imageProof)
      }
      if (!current()) return
      const result = await delivered(ticket, controller.signal)
      if (!current()) return
      challengeId.value = result.challengeId
      maskedEmail.value = result.maskedEmail
      expiresAt = Date.now() + result.expiresIn * 1000
      cooldown(result.resendAfter)
      saved(t('auth.emailCodeSent'))
    } catch (cause) {
      if (current() && !(cause instanceof ApiError && cause.cancelled)) {
        if (cause instanceof ApiError && cause.status === 0 && !pendingDelivery) {
          error.value = t('auth.emailDeliveryUnknown')
          cooldown(60)
        } else error.value = cause instanceof Error ? cause.message : t('common.unknown')
      }
    } finally {
      if (current()) {
        busy.value = false
        active = undefined
        if (attempted) await captcha.load()
      }
    }
  }
  function proof() {
    if (!challengeId.value) throw new Error(t('auth.sendCodeFirst'))
    if (Date.now() >= expiresAt) throw new Error(t('auth.emailCodeExpired'))
    if (!/^\d{6}$/.test(code.value.trim())) throw new Error(t('auth.emailCodeRequired'))
    return { challengeId: challengeId.value, code: code.value.trim() }
  }
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return {
    captcha,
    challengeId,
    code,
    maskedEmail,
    remaining,
    busy,
    pending,
    error,
    reset,
    send,
    proof,
  }
}
