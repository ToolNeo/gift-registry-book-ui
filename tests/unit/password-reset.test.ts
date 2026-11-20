import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { publicRequest } from '@/shared/api/public-client'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import { usePasswordReset } from '@/modules/authentication-manager-ui/views/auth/hooks/usePasswordReset'

vi.mock('@/shared/api/public-client', () => ({
  publicRequest: { post: vi.fn(), get: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
const response = <T>(result: T) => ({ success: true, status: 200, result })
const ticket = {
  challengeId: 'reset-challenge',
  expiresIn: 300,
  resendAfter: 60,
  maskedEmail: 'p***@example.com',
}
const wrappers: ReturnType<typeof mount>[] = []
function setup() {
  let state!: ReturnType<typeof usePasswordReset>
  const completed = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        state = usePasswordReset(completed)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  Object.assign(state.form, {
    username: ' user ',
    email: ' person@example.com ',
    newPassword: ' Newpassword123 ',
    confirmPassword: ' Newpassword123 ',
  })
  state.emailCode.captcha.image.value = {
    key: 'image-key',
    base64: 'data:image/png;base64,aA==',
  }
  state.emailCode.captcha.answer.value = 'A2BCD'
  return { state, completed, wrapper }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', localeMessages.zh)
  vi.mocked(publicRequest.get).mockResolvedValue(
    response({ key: 'next-image', base64: 'data:image/png;base64,aA==' }),
  )
  vi.mocked(publicRequest.post).mockImplementation(async (url) =>
    response(url.endsWith('/email-code') ? ticket : true),
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('anonymous password reset', () => {
  it('sends the identity and retained image proof and resets without old password or automatic login', async () => {
    const { state, completed } = setup()
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledWith(
      '/authorize/password/reset/email-code',
      {
        username: 'user',
        email: 'person@example.com',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        silent: true,
      }),
    )
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    state.emailCode.code.value = '012345'
    await state.submit()
    expect(publicRequest.post).toHaveBeenLastCalledWith(
      '/authorize/password/reset',
      {
        username: 'user',
        email: 'person@example.com',
        newPassword: ' Newpassword123 ',
        challengeId: 'reset-challenge',
        code: '012345',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      { silent: true },
    )
    expect(publicRequest.post).toHaveBeenCalledTimes(2)
    expect(completed).toHaveBeenCalledOnce()
    expect(saved).toHaveBeenLastCalledWith(i18n.global.t('auth.passwordResetDone'))
    expect(state.form.newPassword).toBe('')
  })

  it('blocks missing identity, invalid email, short passwords, mismatched confirmation and missing proof', async () => {
    const { state } = setup()
    state.form.username = ' '
    await state.sendCode()
    state.form.username = 'user'
    state.form.email = 'invalid'
    await state.sendCode()
    expect(publicRequest.post).not.toHaveBeenCalled()
    state.form.email = 'person@example.com'
    await state.sendCode()
    state.emailCode.code.value = '012345'
    state.form.newPassword = 'short'
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('accountPassword.rule'))
    state.form.newPassword = 'Newpassword123'
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('system.passwordMismatch'))
    state.form.confirmPassword = 'Newpassword123'
    state.emailCode.captcha.answer.value = ''
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('auth.imageCaptchaRequired'))
    expect(publicRequest.post).toHaveBeenCalledOnce()
  })

  it('uses the same generic localized failure for send and reset, regardless of private server details', async () => {
    const { state } = setup()
    vi.mocked(publicRequest.post).mockRejectedValueOnce(
      new ApiError('private mismatch details', 400, 'PASSWORD_RESET_INVALID'),
    )
    await state.sendCode()
    expect(state.error.value).toBe(i18n.global.t('auth.passwordResetInvalid'))
    expect(state.emailCode.captcha.answer.value).toBe('')
    state.emailCode.captcha.answer.value = 'ABCDE'
    await state.sendCode()
    state.emailCode.code.value = '012345'
    vi.mocked(publicRequest.post).mockRejectedValueOnce(
      new ApiError('private account existence details', 400, 'PASSWORD_RESET_INVALID'),
    )
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('auth.passwordResetInvalid'))
    expect(saved).toHaveBeenCalledOnce()
  })

  it.each(['username', 'email'] as const)(
    'invalidates sent proof when %s changes',
    async (field) => {
      const { state } = setup()
      await state.sendCode()
      state.emailCode.code.value = '012345'
      state.form[field] = field === 'username' ? 'other' : 'other@example.com'
      expect(state.emailCode.challengeId.value).toBe('')
      expect(state.emailCode.code.value).toBe('')
      await state.submit()
      expect(state.error.value).toBe(i18n.global.t('auth.sendCodeFirst'))
      expect(publicRequest.post).toHaveBeenCalledOnce()
    },
  )

  it('invalidates proof after image refresh and keeps its resend cooldown', async () => {
    const { state } = setup()
    await state.sendCode()
    state.emailCode.code.value = '012345'
    await state.emailCode.captcha.load()
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.remaining.value).toBe(60)
    await state.submit()
    expect(publicRequest.post).toHaveBeenCalledOnce()
  })

  it('waits for asynchronous delivery and cancels obsolete polling on close', async () => {
    const { state } = setup()
    const status = deferred<ReturnType<typeof response<{ status: string; expiresIn: number }>>>()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(
      response({ ...ticket, deliveryStatus: 'SENDING' }),
    )
    vi.mocked(publicRequest.get).mockReturnValueOnce(status.promise)
    const sending = state.sendCode()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    expect(state.emailCode.busy.value).toBe(true)
    expect(saved).not.toHaveBeenCalled()
    state.reset()
    status.resolve(response({ status: 'SENT', expiresIn: 300 }))
    await sending
    expect(state.emailCode.challengeId.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    expect(saved).not.toHaveBeenCalled()
  })

  it('locks an authoritative reset until the response, then preserves a rejected draft for retry', async () => {
    const { state, completed } = setup()
    await state.sendCode()
    state.emailCode.code.value = '012345'
    const result = deferred<ReturnType<typeof response<boolean>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(result.promise)
    const writing = state.submit()
    state.reset()
    await state.submit()
    expect(state.writing.value).toBe(true)
    expect(publicRequest.post).toHaveBeenCalledTimes(2)
    result.reject(new ApiError('invalid', 400, 'PASSWORD_RESET_INVALID'))
    await writing
    expect(state.writing.value).toBe(false)
    expect(state.form.newPassword).toBe(' Newpassword123 ')
    expect(completed).not.toHaveBeenCalled()
    await state.submit()
    expect(completed).toHaveBeenCalledOnce()
  })
})
