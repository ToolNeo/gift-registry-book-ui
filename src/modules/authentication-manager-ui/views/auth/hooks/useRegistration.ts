import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { registrationApi } from '@/modules/authentication-manager-ui/api/auth/registration'
import { useEmailCode } from '@/modules/authentication-manager-ui/hooks/useEmailCode'
import { validEmail, validPassword } from '@/modules/authentication-manager-ui/utils/user'
import { t } from '@/shared/i18n'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'

const empty = () => ({
  username: '',
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
})
export function useRegistration(completed: () => void) {
  const form = reactive(empty()),
    writing = ref(false),
    error = ref(''),
    usernameError = ref(''),
    checkingUsername = ref(false)
  let generation = 0,
    disposed = false,
    usernameGeneration = 0,
    usernameRequest: AbortController | undefined
  const emailCode = useEmailCode((signal, captcha) => {
    if (!form.email.trim() || !validEmail(form.email) || form.email.trim().length > 255)
      throw new Error(t('auth.emailInvalid'))
    return registrationApi.sendCode(form.email.trim(), captcha, {
      signal,
      silent: true,
    })
  })
  watch(
    () => form.email,
    () => emailCode.reset(),
    { flush: 'sync' },
  )
  watch(
    () => form.username,
    () => {
      usernameGeneration++
      usernameRequest?.abort()
      usernameRequest = undefined
      usernameError.value = ''
      checkingUsername.value = false
    },
    { flush: 'sync' },
  )
  function validUsername() {
    return form.username.trim().length >= 5 && form.username.trim().length <= 64
  }
  /** Blur checks are advisory; edits invalidate responses and registration rechecks in the database. */
  async function checkUsername() {
    usernameRequest?.abort()
    const version = ++usernameGeneration,
      username = form.username.trim()
    usernameError.value = ''
    if (!validUsername()) {
      usernameError.value = t('auth.usernameRule')
      checkingUsername.value = false
      return
    }
    const controller = new AbortController()
    usernameRequest = controller
    checkingUsername.value = true
    const current = () => !disposed && version === usernameGeneration && !controller.signal.aborted
    try {
      const result = await registrationApi.validateUsername(username, {
        signal: controller.signal,
        silent: true,
      })
      if (current() && result.valid !== true) usernameError.value = t('auth.usernameInUse')
    } catch (cause) {
      if (current())
        usernameError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current()) {
        checkingUsername.value = false
        usernameRequest = undefined
      }
    }
  }
  const busy = computed(() => writing.value || emailCode.busy.value)
  const message = computed(() => error.value || emailCode.error.value)
  function reset() {
    if (writing.value) return
    generation++
    error.value = usernameError.value = ''
    usernameGeneration++
    usernameRequest?.abort()
    usernameRequest = undefined
    checkingUsername.value = false
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
      if (!validUsername()) throw new Error(t('auth.usernameRule'))
      if (usernameError.value) throw new Error(usernameError.value)
      if (!form.name.trim() || form.name.trim().length > 128) throw new Error(t('common.required'))
      if (!form.email.trim() || !validEmail(form.email) || form.email.trim().length > 255)
        throw new Error(t('auth.emailInvalid'))
      if (!validPassword(form.password)) throw new Error(t('accountPassword.rule'))
      if (form.password !== form.confirmPassword) throw new Error(t('system.passwordMismatch'))
      const proof = emailCode.proof()
      writing.value = true
      // Closing cannot undo account creation; keep the submitted draft locked until it settles.
      const result = await registrationApi.register(
        {
          username: form.username.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          ...proof,
        },
        { silent: true },
      )
      if (disposed || version !== generation) return
      if (result.registered !== true) throw new Error(t('auth.registerFailed'))
      saved(t('auth.registered'))
      writing.value = false
      reset()
      completed()
    } catch (cause) {
      if (!disposed && version === generation)
        error.value =
          cause instanceof ApiError && cause.code === 'USERNAME_IN_USE'
            ? t('auth.usernameInUse')
            : cause instanceof Error
              ? cause.message
              : t('common.unknown')
    } finally {
      if (!disposed && version === generation) writing.value = false
    }
  }
  onBeforeUnmount(() => {
    disposed = true
    generation++
    usernameGeneration++
    usernameRequest?.abort()
  })
  return {
    form,
    usernameError,
    checkingUsername,
    checkUsername,
    emailCode,
    writing,
    busy,
    error: message,
    reset,
    sendCode,
    submit,
  }
}
