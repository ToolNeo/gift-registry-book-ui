import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import { useRegistration } from '@/modules/authentication-manager-ui/views/auth/hooks/useRegistration'
import { useEmailBinding } from '@/modules/authentication-manager-ui/views/account/hooks/useEmailBinding'
import { usePasswordChange } from '@/modules/authentication-manager-ui/views/account/hooks/usePasswordChange'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({
  publicRequest: { post: vi.fn(), get: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
const response = <T>(result: T) => ({ success: true, status: 200, result })
const challenge = (id = 'challenge-1') => ({
  challengeId: id,
  expiresIn: 300,
  resendAfter: 60,
  maskedEmail: 'p***@example.com',
})
const wrappers: ReturnType<typeof mount>[] = []
function setup<T>(factory: (completed: () => void) => T) {
  let state!: T
  const completed = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        state = factory(completed)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { state, completed, wrapper }
}
function registration() {
  const result = setup(useRegistration)
  Object.assign(result.state.form, {
    username: ' users ',
    name: ' Person ',
    email: 'person@example.com',
    password: ' Newpassword123 ',
    confirmPassword: ' Newpassword123 ',
  })
  return result
}
async function send(
  state:
    | ReturnType<typeof useRegistration>
    | ReturnType<typeof useEmailBinding>
    | ReturnType<typeof usePasswordChange>,
) {
  state.emailCode.captcha.image.value = {
    key: 'image-key',
    base64: 'data:image/png;base64,aA==',
  }
  state.emailCode.captcha.answer.value = 'A2BCD'
  await state.sendCode()
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
  vi.mocked(publicRequest.get).mockResolvedValue(
    response({ key: 'next-image', base64: 'data:image/png;base64,aA==' }),
  )
  vi.mocked(publicRequest.post).mockImplementation(async (url) =>
    response(url.endsWith('/email-code') ? challenge() : { registered: true }),
  )
  vi.mocked(request.get).mockResolvedValue(
    response({ bound: true, maskedEmail: 'p***@example.com' }),
  )
  vi.mocked(request.post).mockImplementation(async (url) =>
    response(url.endsWith('/_validate') ? { passed: true } : challenge()),
  )
  vi.mocked(request.put).mockResolvedValue(response(true))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', localeMessages.zh)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

describe('verified email account flows', () => {
  it('waits through a one-minute SMTP delay without a false failure or duplicate send', async () => {
    const { state } = registration()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(
      response({ ...challenge(), deliveryStatus: 'SENDING' }),
    )
    let status = 'SENDING'
    vi.mocked(publicRequest.get).mockImplementation(async (url) =>
      response(
        url.includes('/email/code/')
          ? { status, expiresIn: status === 'SENT' ? 300 : 0 }
          : { key: 'next-image', base64: 'data:image/png;base64,aA==' },
      ),
    )
    const sending = send(state)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60000)
    expect(state.emailCode.busy.value).toBe(true)
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.error.value).toBe('')
    expect(saved).not.toHaveBeenCalled()
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledOnce()
    status = 'SENT'
    await vi.advanceTimersByTimeAsync(2000)
    await sending
    expect(state.emailCode.challengeId.value).toBe('challenge-1')
    expect(state.emailCode.remaining.value).toBe(60)
    expect(state.emailCode.pending.value).toBe(false)
    expect(state.emailCode.captcha.image.value.key).toBe('image-key')
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    expect(saved).toHaveBeenCalledOnce()
  })

  it('retries only status queries after uncertain network reads and can resume polling', async () => {
    const { state } = registration()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(
      response({ ...challenge(), deliveryStatus: 'SENDING' }),
    )
    vi.mocked(publicRequest.get).mockRejectedValue(new ApiError('Network failure', 0))
    const sending = send(state)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(150000)
    await sending
    expect(state.emailCode.error.value).toBe(i18n.global.t('auth.emailDeliveryUnknown'))
    expect(state.emailCode.pending.value).toBe(true)
    expect(state.emailCode.busy.value).toBe(false)
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    expect(saved).not.toHaveBeenCalled()
    vi.mocked(publicRequest.get).mockResolvedValue(response({ status: 'SENT', expiresIn: 240 }))
    const checking = state.sendCode()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    await checking
    expect(publicRequest.post).toHaveBeenCalledOnce()
    expect(state.emailCode.challengeId.value).toBe('challenge-1')
    expect(saved).toHaveBeenCalledOnce()
  })

  it('does not claim a queued email was sent after SMTP reports failure', async () => {
    const { state } = registration()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(
      response({ ...challenge(), deliveryStatus: 'SENDING' }),
    )
    vi.mocked(publicRequest.get).mockResolvedValue(response({ status: 'FAILED', expiresIn: 0 }))
    const sending = send(state)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    await sending
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.pending.value).toBe(false)
    expect(state.emailCode.error.value).toBe(i18n.global.t('auth.emailDeliveryFailed'))
    expect(saved).not.toHaveBeenCalled()
  })

  it('aborts pending status timers on close and ignores a late successful poll', async () => {
    const { state } = registration()
    const status = deferred<ReturnType<typeof response<{ status: string; expiresIn: number }>>>()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(
      response({ ...challenge(), deliveryStatus: 'SENDING' }),
    )
    vi.mocked(publicRequest.get).mockReturnValueOnce(status.promise)
    const sending = send(state)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    state.reset()
    status.resolve(response({ status: 'SENT', expiresIn: 300 }))
    await sending
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.pending.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(saved).not.toHaveBeenCalled()
  })

  it('requires a delivered six-digit code and registers only the fixed public DTO without a role or automatic login', async () => {
    const { state, completed } = registration()
    await state.submit()
    expect(publicRequest.post).not.toHaveBeenCalled()
    expect(state.error.value).toBe(i18n.global.t('auth.sendCodeFirst'))
    await send(state)
    expect(publicRequest.post).toHaveBeenCalledWith(
      '/authorize/register/email-code',
      {
        email: 'person@example.com',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        silent: true,
      }),
    )
    state.emailCode.code.value = '12345'
    await state.submit()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    state.emailCode.code.value = '012345'
    await state.submit()
    expect(publicRequest.post).toHaveBeenLastCalledWith(
      '/authorize/register',
      {
        username: 'users',
        name: 'Person',
        email: 'person@example.com',
        password: ' Newpassword123 ',
        challengeId: 'challenge-1',
        code: '012345',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      { silent: true },
    )
    expect(completed).toHaveBeenCalledOnce()
    expect(state.form.password).toBe('')
    expect(request.post).not.toHaveBeenCalled()
    expect(saved).toHaveBeenCalledWith(i18n.global.t('auth.registered'))
  })
  it('does not send invalid email, does not report failed delivery as success and can retry', async () => {
    const { state } = registration()
    state.form.email = 'invalid'
    await send(state)
    expect(publicRequest.post).not.toHaveBeenCalled()
    state.form.email = 'person@example.com'
    vi.mocked(publicRequest.post).mockRejectedValueOnce(new Error('Mail unavailable'))
    await send(state)
    expect(state.error.value).toBe('Mail unavailable')
    expect(saved).not.toHaveBeenCalled()
    await send(state)
    expect(state.emailCode.challengeId.value).toBe('challenge-1')
    expect(saved).toHaveBeenCalledOnce()
  })
  it('changing the email cancels its request and prevents late delivery from creating a challenge or timer', async () => {
    const pending = deferred<ReturnType<typeof response<ReturnType<typeof challenge>>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(pending.promise)
    const { state } = registration()
    const sending = send(state)
    const signal = vi.mocked(publicRequest.post).mock.calls[0]![2]!.signal!
    state.form.email = 'other@example.com'
    expect(signal.aborted).toBe(true)
    pending.resolve(response(challenge()))
    await sending
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.code.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    expect(saved).not.toHaveBeenCalled()
  })
  it('enforces the displayed cooldown, replaces old proof on resend and blocks local expiry', async () => {
    const { state } = registration()
    await send(state)
    state.emailCode.code.value = '012345'
    await send(state)
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    expect(state.emailCode.remaining.value).toBe(0)
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    expect(state.emailCode.challengeId.value).toBe('challenge-1')
    expect(state.emailCode.code.value).toBe('012345')
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    expect(state.error.value).toBe(i18n.global.t('auth.refreshCaptchaToResend'))
    state.form.email = 'another@example.com'
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    expect(state.error.value).toBe(i18n.global.t('auth.refreshCaptchaToResend'))
    await state.emailCode.captcha.load()
    vi.mocked(publicRequest.post).mockResolvedValueOnce(response(challenge('challenge-2')))
    await send(state)
    expect(state.emailCode.challengeId.value).toBe('challenge-2')
    expect(state.emailCode.code.value).toBe('')
    state.emailCode.code.value = '012345'
    await vi.advanceTimersByTimeAsync(300000)
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('auth.emailCodeExpired'))
    expect(publicRequest.post).toHaveBeenCalledTimes(2)
  })
  it('closing and unmounting cancel pending email sends without leaking timers or success feedback', async () => {
    const { state, wrapper } = registration()
    await send(state)
    expect(vi.getTimerCount()).toBe(1)
    state.reset()
    expect(vi.getTimerCount()).toBe(0)
    const pending = deferred<ReturnType<typeof response<ReturnType<typeof challenge>>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(pending.promise)
    state.form.email = 'next@example.com'
    await state.emailCode.captcha.load()
    const sending = send(state)
    const signal = vi.mocked(publicRequest.post).mock.calls.at(-1)![2]!.signal!
    wrapper.unmount()
    pending.resolve(response(challenge('late')))
    await sending
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(saved).toHaveBeenCalledTimes(1)
  })
  it('locks account creation until the authoritative response and preserves a failed draft for recovery', async () => {
    const { state, completed } = registration()
    await send(state)
    state.emailCode.code.value = '012345'
    const pending = deferred<ReturnType<typeof response<{ registered: boolean }>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(pending.promise)
    const writing = state.submit()
    expect(state.writing.value).toBe(true)
    state.reset()
    await state.submit()
    expect(state.form.username).toBe(' users ')
    expect(publicRequest.post).toHaveBeenCalledTimes(2)
    pending.reject(new Error('Code rejected'))
    await writing
    expect(state.writing.value).toBe(false)
    expect(state.error.value).toBe('Code rejected')
    expect(completed).not.toHaveBeenCalled()
    await state.submit()
    expect(completed).toHaveBeenCalledOnce()
  })
  it('first binding requires the current password, verifies the new email and sends only the binding DTO', async () => {
    const { state, completed } = setup(useEmailBinding)
    state.form.email = 'person@example.com'
    await send(state)
    expect(request.post).not.toHaveBeenCalled()
    state.form.oldPassword = ' raw current '
    await send(state)
    expect(request.post).toHaveBeenCalledWith(
      '/user/me/email/code',
      {
        email: 'person@example.com',
        oldPassword: ' raw current ',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      expect.objectContaining({ silent: true }),
    )
    state.emailCode.code.value = '012345'
    await state.submit()
    expect(request.put).toHaveBeenCalledWith(
      '/user/me/email',
      {
        email: 'person@example.com',
        oldPassword: ' raw current ',
        challengeId: 'challenge-1',
        code: '012345',
      },
      { silent: true },
    )
    expect(completed).toHaveBeenCalledOnce()
    expect(state.form).toEqual({ email: '', oldPassword: '' })
  })
  it('binding proof cannot be reused after the target or password changes, and an already-bound rejection stays recoverable', async () => {
    const { state } = setup(useEmailBinding)
    Object.assign(state.form, {
      email: 'person@example.com',
      oldPassword: 'old',
    })
    await send(state)
    state.emailCode.code.value = '012345'
    state.form.oldPassword = 'changed'
    await state.submit()
    expect(request.put).not.toHaveBeenCalled()
    vi.mocked(request.post).mockRejectedValueOnce(new Error('Email already bound'))
    await send(state)
    expect(state.error.value).toBe('Email already bound')
    expect(state.writing.value).toBe(false)
  })
  it('password changes never send to an arbitrary contact email and cannot bypass an unbound or missing-code state', async () => {
    const { state, completed } = setup(usePasswordChange)
    vi.mocked(request.get).mockResolvedValueOnce(response({ bound: false }))
    await state.email.load()
    state.setOldPassword('old')
    await state.next()
    state.setNewPassword('Newpassword123')
    await state.next()
    state.setConfirmation('Newpassword123')
    await send(state)
    await state.submit()
    expect(request.put).not.toHaveBeenCalled()
    expect(state.error.value).toBe(i18n.global.t('accountEmail.bindFirst'))
    await state.email.load()
    await state.submit()
    expect(request.put).not.toHaveBeenCalled()
    await send(state)
    expect(request.post).toHaveBeenLastCalledWith(
      '/user/me/password/email-code',
      { verifyKey: 'image-key', verifyCode: 'A2BCD' },
      expect.objectContaining({ silent: true }),
    )
    state.emailCode.code.value = '012345'
    vi.mocked(request.put).mockRejectedValueOnce(new Error('Wrong or expired code'))
    await state.submit()
    expect(state.error.value).toBe('Wrong or expired code')
    expect(completed).not.toHaveBeenCalled()
    state.emailCode.code.value = '654321'
    await state.submit()
    expect(request.put).toHaveBeenLastCalledWith(
      '/user/me/password',
      {
        oldPassword: 'old',
        newPassword: 'Newpassword123',
        challengeId: 'challenge-1',
        code: '654321',
        verifyKey: 'image-key',
        verifyCode: 'A2BCD',
      },
      { silent: true },
    )
    expect(completed).toHaveBeenCalledOnce()
    await flushPromises()
  })
})

describe('image captcha and registration username boundaries', () => {
  it('preserves the accepted image and submits the current answer again with the email code', async () => {
    const { state } = registration()
    await send(state)
    expect(publicRequest.get).not.toHaveBeenCalled()
    expect(state.emailCode.captcha.image.value.key).toBe('image-key')
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    state.emailCode.code.value = '012345'
    state.emailCode.captcha.answer.value = ''
    await state.submit()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    state.emailCode.captcha.answer.value = ' current-answer '
    await state.submit()
    expect(publicRequest.post).toHaveBeenLastCalledWith(
      '/authorize/register',
      expect.objectContaining({
        challengeId: 'challenge-1',
        code: '012345',
        verifyKey: 'image-key',
        verifyCode: 'current-answer',
      }),
      { silent: true },
    )
  })

  it('does not clear an image after local validation or an uncertain send response', async () => {
    const { state } = registration()
    state.form.email = 'invalid'
    await send(state)
    expect(publicRequest.post).not.toHaveBeenCalled()
    expect(publicRequest.get).not.toHaveBeenCalled()
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    state.form.email = 'person@example.com'
    vi.mocked(publicRequest.post).mockRejectedValueOnce(new ApiError('Network failure', 0))
    await state.sendCode()
    expect(state.emailCode.captcha.answer.value).toBe('A2BCD')
    expect(state.emailCode.captcha.image.value.key).toBe('image-key')
    expect(state.emailCode.remaining.value).toBe(60)
    expect(publicRequest.get).not.toHaveBeenCalled()
  })

  it('ignores old send responses after the bound image is refreshed', async () => {
    const { state } = registration()
    const pending = deferred<ReturnType<typeof response<ReturnType<typeof challenge>>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(pending.promise)
    const sending = send(state)
    const signal = vi.mocked(publicRequest.post).mock.calls[0]![2]!.signal!
    await state.emailCode.captcha.load()
    state.emailCode.captcha.answer.value = 'NEW'
    pending.resolve(response(challenge('old-challenge')))
    await sending
    expect(signal.aborted).toBe(true)
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.captcha.image.value.key).toBe('next-image')
    expect(state.emailCode.captcha.answer.value).toBe('NEW')
    expect(saved).not.toHaveBeenCalled()
  })

  it('never sends email without image proof and refreshes a consumed image after server rejection', async () => {
    const { state } = registration()
    await state.sendCode()
    expect(publicRequest.post).not.toHaveBeenCalled()
    expect(state.error.value).toBe(i18n.global.t('auth.imageCaptchaRequired'))
    await state.emailCode.captcha.load()
    state.emailCode.captcha.answer.value = 'WRONG'
    vi.mocked(publicRequest.post).mockRejectedValueOnce(new Error('图形验证码错误'))
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledWith(
      '/authorize/register/email-code',
      {
        email: 'person@example.com',
        verifyKey: 'next-image',
        verifyCode: 'WRONG',
      },
      expect.objectContaining({ silent: true }),
    )
    expect(state.error.value).toBe('图形验证码错误')
    expect(state.emailCode.captcha.answer.value).toBe('')
    expect(publicRequest.get).toHaveBeenCalledTimes(2)
    await state.sendCode()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
  })

  it('invalidates bound email proof on image refresh even if refreshing fails, without bypassing cooldown', async () => {
    const { state } = registration()
    await send(state)
    state.emailCode.code.value = '012345'
    vi.mocked(publicRequest.get).mockRejectedValueOnce(new Error('Network unavailable'))
    await state.emailCode.captcha.load()
    expect(state.emailCode.captcha.error.value).toBe(i18n.global.t('auth.imageCaptchaFailed'))
    expect(state.emailCode.challengeId.value).toBe('')
    expect(state.emailCode.code.value).toBe('')
    expect(state.emailCode.remaining.value).toBe(60)
    await state.emailCode.captcha.load()
    expect(state.emailCode.captcha.error.value).toBe('')
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('auth.sendCodeFirst'))
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
  })

  it('ignores late image responses after refresh, closing or unmounting', async () => {
    const { state, wrapper } = registration()
    const pending = deferred<ReturnType<typeof response<{ key: string; base64: string }>>>()
    vi.mocked(publicRequest.get).mockReturnValueOnce(pending.promise)
    const loading = state.emailCode.captcha.load()
    const signal = vi.mocked(publicRequest.get).mock.calls[0]![2]!.signal!
    await state.emailCode.captcha.load()
    pending.resolve(response({ key: 'late', base64: 'late' }))
    await loading
    expect(signal.aborted).toBe(true)
    expect(state.emailCode.captcha.image.value.key).toBe('next-image')
    const closing = deferred<ReturnType<typeof response<{ key: string; base64: string }>>>()
    vi.mocked(publicRequest.get).mockReturnValueOnce(closing.promise)
    const request = state.emailCode.captcha.load()
    state.reset()
    wrapper.unmount()
    closing.resolve(response({ key: 'closed', base64: 'closed' }))
    await request
    expect(state.emailCode.captcha.image.value.key).toBe('')
    expect(state.emailCode.captcha.loading.value).toBe(false)
  })

  it('validates trimmed username length locally and blocks known duplicate names', async () => {
    const { state } = registration()
    for (const username of ['abcd', ' '.repeat(5), 'x'.repeat(65)]) {
      state.form.username = username
      await state.checkUsername()
      await state.submit()
      expect(state.usernameError.value).toBe(i18n.global.t('auth.usernameRule'))
      expect(state.error.value).toBe(i18n.global.t('auth.usernameRule'))
    }
    expect(publicRequest.post).not.toHaveBeenCalled()
    state.form.username = ' taken '
    vi.mocked(publicRequest.post).mockResolvedValueOnce(response({ valid: false }))
    await state.checkUsername()
    expect(publicRequest.post).toHaveBeenCalledWith(
      '/authorize/register/username/_validate',
      { username: 'taken' },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        silent: true,
      }),
    )
    expect(state.usernameError.value).toBe(i18n.global.t('auth.usernameInUse'))
    await state.submit()
    expect(publicRequest.post).toHaveBeenCalledTimes(1)
    state.form.username = 'x'.repeat(64)
    vi.mocked(publicRequest.post).mockResolvedValueOnce(response({ valid: true }))
    await state.checkUsername()
    expect(state.usernameError.value).toBe('')
  })

  it('cancels stale username checks after edits and allows retry after validation failure', async () => {
    const { state } = registration()
    const pending = deferred<ReturnType<typeof response<{ valid: boolean }>>>()
    vi.mocked(publicRequest.post).mockReturnValueOnce(pending.promise)
    const checking = state.checkUsername()
    const signal = vi.mocked(publicRequest.post).mock.calls[0]![2]!.signal!
    state.form.username = 'another'
    pending.resolve(response({ valid: false }))
    await checking
    expect(signal.aborted).toBe(true)
    expect(state.usernameError.value).toBe('')
    vi.mocked(publicRequest.post).mockRejectedValueOnce(new Error('Unavailable'))
    await state.checkUsername()
    expect(state.usernameError.value).toBe('Unavailable')
    vi.mocked(publicRequest.post).mockResolvedValueOnce(response({ valid: true }))
    await state.checkUsername()
    expect(state.usernameError.value).toBe('')
    expect(state.checkingUsername.value).toBe(false)
  })
})

describe('email image independence and final username authority', () => {
  it('preserves the unused image through normal email and old-password edits', async () => {
    const { state: registrationState } = registration()
    await registrationState.emailCode.captcha.load()
    registrationState.form.email = 'new@example.com'
    expect(registrationState.emailCode.captcha.image.value.key).toBe('next-image')
    const { state } = setup(useEmailBinding)
    await state.emailCode.captcha.load()
    state.form.oldPassword = ' old password '
    state.form.email = 'person@example.com'
    expect(state.emailCode.captcha.image.value.key).toBe('next-image')
    state.emailCode.captcha.answer.value = 'A2BCD'
    await state.sendCode()
    expect(request.post).toHaveBeenLastCalledWith(
      '/user/me/email/code',
      {
        email: 'person@example.com',
        oldPassword: ' old password ',
        verifyKey: 'next-image',
        verifyCode: 'A2BCD',
      },
      expect.objectContaining({ silent: true }),
    )
  })

  it('shows a concurrent username conflict from final registration while preserving its draft', async () => {
    const { state, completed } = registration()
    await send(state)
    state.emailCode.code.value = '012345'
    vi.mocked(publicRequest.post).mockRejectedValueOnce(
      new ApiError('conflict', 409, 'USERNAME_IN_USE'),
    )
    await state.submit()
    expect(state.error.value).toBe(i18n.global.t('auth.usernameInUse'))
    expect(state.form.username).toBe(' users ')
    expect(completed).not.toHaveBeenCalled()
  })
})
