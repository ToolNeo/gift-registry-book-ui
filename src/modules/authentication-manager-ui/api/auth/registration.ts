import { publicRequest } from '@/shared/api/public-client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  EmailCodeChallenge,
  RegistrationInput,
  EmailCaptchaProof,
} from '@/modules/authentication-manager-ui/types/auth'

export const registrationApi = {
  sendCode: async (email: string, captcha: EmailCaptchaProof, options?: RequestOptions) =>
    (
      await publicRequest.post<EmailCodeChallenge>(
        '/authorize/register/email-code',
        { email, ...captcha },
        options,
      )
    ).result,
  captcha: async (signal: AbortSignal) =>
    (
      await publicRequest.get<{ key: string; base64: string }>(
        '/authorize/email/captcha/image',
        { width: 160, height: 40 },
        { signal, silent: true },
      )
    ).result,
  validateUsername: async (username: string, options?: RequestOptions) =>
    (
      await publicRequest.post<{ valid: boolean }>(
        '/authorize/register/username/_validate',
        { username },
        options,
      )
    ).result,
  register: async (input: RegistrationInput, options?: RequestOptions) =>
    (await publicRequest.post<{ registered: boolean }>('/authorize/register', input, options))
      .result,
}
