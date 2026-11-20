import { publicRequest } from '@/shared/api/public-client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  EmailCaptchaProof,
  EmailCodeChallenge,
  PasswordResetIdentity,
  PasswordResetInput,
} from '@/modules/authentication-manager-ui/types/auth'

export const passwordResetApi = {
  sendCode: async (
    identity: PasswordResetIdentity,
    captcha: EmailCaptchaProof,
    options?: RequestOptions,
  ) =>
    (
      await publicRequest.post<EmailCodeChallenge>(
        '/authorize/password/reset/email-code',
        { ...identity, ...captcha },
        options,
      )
    ).result,
  reset: async (input: PasswordResetInput, options?: RequestOptions) =>
    (await publicRequest.post<boolean>('/authorize/password/reset', input, options)).result,
}
