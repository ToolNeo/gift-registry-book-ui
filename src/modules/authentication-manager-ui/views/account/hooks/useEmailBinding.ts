import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  bindMeEmail_api,
  sendBindingEmailCode_api,
} from '@/modules/authentication-manager-ui/api/account/center'
import { useEmailCode } from '@/modules/authentication-manager-ui/hooks/useEmailCode'
import { validEmail } from '@/modules/authentication-manager-ui/utils/user'
import { t } from '@/shared/i18n'
import { saved } from '@/shared/utils/feedback'

export function useEmailBinding(completed: () => Promise<void> | void) {
  const form = reactive({ email: '', oldPassword: '' }),
    writing = ref(false),
    error = ref('')
  let generation = 0,
    disposed = false
  const emailCode = useEmailCode((signal, captcha) => {
    if (!form.email.trim() || !validEmail(form.email) || form.email.trim().length > 255)
      throw new Error(t('auth.emailInvalid'))
    if (!form.oldPassword) throw new Error(t('common.required'))
    return sendBindingEmailCode_api(
      { email: form.email.trim(), oldPassword: form.oldPassword, ...captcha },
      { signal, silent: true },
    )
  })
  watch(
    () => [form.email, form.oldPassword],
    () => emailCode.reset(),
    { flush: 'sync' },
  )
  const busy = computed(() => writing.value || emailCode.busy.value)
  const message = computed(() => error.value || emailCode.error.value)
  function reset() {
    if (writing.value) return
    generation++
    form.email = form.oldPassword = error.value = ''
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
    const version = generation
    error.value = ''
    try {
      if (!form.email.trim() || !validEmail(form.email) || form.email.trim().length > 255)
        throw new Error(t('auth.emailInvalid'))
      if (!form.oldPassword) throw new Error(t('common.required'))
      const proof = emailCode.proof()
      writing.value = true
      const result = await bindMeEmail_api(
        { email: form.email.trim(), oldPassword: form.oldPassword, ...proof },
        { silent: true },
      )
      if (disposed || version !== generation) return
      if (result !== true) throw new Error(t('accountEmail.bindFailed'))
      saved(t('accountEmail.boundSuccess'))
      writing.value = false
      reset()
      await completed()
    } catch (cause) {
      if (!disposed && version === generation)
        error.value = cause instanceof Error ? cause.message : t('common.unknown')
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
