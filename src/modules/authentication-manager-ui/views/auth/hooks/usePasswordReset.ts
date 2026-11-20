import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { passwordResetApi } from '@/modules/authentication-manager-ui/api/auth/password-reset'
import { useEmailCode } from '@/modules/authentication-manager-ui/hooks/useEmailCode'
import { validEmail, validPassword } from '@/modules/authentication-manager-ui/utils/user'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { saved } from '@/shared/utils/feedback'

const empty = () => ({
  username: '',
  email: '',
  newPassword: '',
  confirmPassword: '',
})

/** The anonymous reset draft binds its email challenge to the username, email and original image. */
export function usePasswordReset(completed: () => void) {
  const form = reactive(empty()),
    writing = ref(false),
    error = ref('')
  let generation = 0,
    disposed = false
  const failure = (cause: unknown) =>
    cause instanceof ApiError && cause.code === 'PASSWORD_RESET_INVALID'
      ? t('auth.passwordResetInvalid')
      : cause instanceof Error
        ? cause.message
        : t('common.unknown')
  function identity() {
    const username = form.username.trim(),
      email = form.email.trim()
    if (!username || username.length > 64) throw new Error(t('common.required'))
    if (!email || !validEmail(email) || email.length > 255) throw new Error(t('auth.emailInvalid'))
    return { username, email }
  }
  const emailCode = useEmailCode(
    (signal, captcha) => {
      const input = identity()
      return passwordResetApi.sendCode(input, captcha, { signal, silent: true }).catch((cause) => {
        if (cause instanceof ApiError && cause.code === 'PASSWORD_RESET_INVALID')
          throw new Error(failure(cause))
        throw cause
      })
    },
    { bindCaptcha: true },
  )
  watch(
    () => [form.username, form.email],
    () => {
      error.value = ''
      emailCode.reset()
    },
    { flush: 'sync' },
  )
  const busy = computed(() => writing.value || emailCode.busy.value)
  const message = computed(() => error.value || emailCode.error.value)
  function reset() {
    if (writing.value) return
    generation++
    error.value = ''
    Object.assign(form, empty())
    emailCode.reset()
    emailCode.captcha.reset()
  }
  async function sendCode() {
    if (writing.value) return
    error.value = ''
    await emailCode.send()
  }
  async function submit() {
    if (busy.value || disposed) return
    error.value = ''
    const version = generation
    try {
      const input = identity()
      if (!validPassword(form.newPassword)) throw new Error(t('accountPassword.rule'))
      if (form.newPassword !== form.confirmPassword) throw new Error(t('system.passwordMismatch'))
      const proof = { ...emailCode.proof(), ...emailCode.captcha.proof() }
      writing.value = true
      // Closing cannot undo a password update; keep the submitted draft locked until it settles.
      const result = await passwordResetApi.reset(
        { ...input, newPassword: form.newPassword, ...proof },
        { silent: true },
      )
      if (disposed || version !== generation) return
      if (result !== true) throw new Error(t('auth.passwordResetInvalid'))
      saved(t('auth.passwordResetDone'))
      writing.value = false
      reset()
      completed()
    } catch (cause) {
      if (!disposed && version === generation) error.value = failure(cause)
    } finally {
      if (!disposed && version === generation) writing.value = false
    }
  }
  onBeforeUnmount(() => {
    disposed = true
    generation++
  })
  return {
    form,
    emailCode,
    writing,
    busy,
    error: message,
    reset,
    sendCode,
    submit,
  }
}
