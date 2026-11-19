import { onBeforeUnmount, ref } from 'vue'
import { registrationApi } from '@/modules/authentication-manager-ui/api/auth/registration'
import { t } from '@/shared/i18n'

/** Image challenges belong to one open form; callers decide whether email proof binds this image. */
export function useEmailCaptcha() {
  const image = ref({ key: '', base64: '' }),
    answer = ref(''),
    loading = ref(false),
    error = ref('')
  let generation = 0,
    disposed = false,
    active: AbortController | undefined
  function reset() {
    generation++
    active?.abort()
    active = undefined
    image.value = { key: '', base64: '' }
    answer.value = error.value = ''
    loading.value = false
  }
  async function load() {
    if (disposed) return
    reset()
    const version = generation,
      controller = new AbortController()
    active = controller
    loading.value = true
    const current = () => !disposed && version === generation && !controller.signal.aborted
    try {
      const result = await registrationApi.captcha(controller.signal)
      if (current()) image.value = result
    } catch {
      if (current()) error.value = t('auth.imageCaptchaFailed')
    } finally {
      if (current()) {
        loading.value = false
        active = undefined
      }
    }
  }
  function proof() {
    if (loading.value || !image.value.key || !answer.value.trim())
      throw new Error(t('auth.imageCaptchaRequired'))
    return { verifyKey: image.value.key, verifyCode: answer.value.trim() }
  }
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return { image, answer, loading, error, reset, load, proof }
}
