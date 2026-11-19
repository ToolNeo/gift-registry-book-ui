import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  PasswordChangeInput,
  PasswordValidation,
  BoundEmail,
  EmailBindingInput,
} from '@/modules/authentication-manager-ui/types/account'
import type {
  EmailCodeChallenge,
  EmailCaptchaProof,
} from '@/modules/authentication-manager-ui/types/auth'

/** 上传本人头像，返回待保存的图像地址；资料仍由用户确认后单独提交。 */
export const uploadMeAvatar_api = async (file: File) => {
  const data = new FormData()
  data.append('file', file)
  return (await request.post<{ url: string; accessUrl: string }>('/user/me/avatar', data)).result
}

// 修改登录用户信息
export const updateMeInfo_api = (data: object) => request.put(`/user/detail`, data)
// 修改登录用户密码
export const updateMepsd_api = (data: PasswordChangeInput, options?: RequestOptions) =>
  request.put<boolean>(`/user/me/password`, data, options)
export const getMeEmail_api = async (options?: RequestOptions) =>
  (await request.get<BoundEmail>('/user/me/email', undefined, options)).result
export const sendBindingEmailCode_api = async (
  input: Pick<EmailBindingInput, 'email' | 'oldPassword'> & EmailCaptchaProof,
  options?: RequestOptions,
) => (await request.post<EmailCodeChallenge>('/user/me/email/code', input, options)).result
export const bindMeEmail_api = async (input: EmailBindingInput, options?: RequestOptions) =>
  (await request.put<boolean>('/user/me/email', input, options)).result
export const sendPasswordEmailCode_api = async (
  input: EmailCaptchaProof,
  options?: RequestOptions,
) => (await request.post<EmailCodeChallenge>('/user/me/password/email-code', input, options)).result
/**
 * 校验字段合法性
 * @param type 类型
 * @param name 值
 */
export const validateField_api = (
  type: 'username' | 'password',
  name: string,
  options?: RequestOptions,
) =>
  request.post<PasswordValidation>(`/user/${type}/_validate`, name, {
    ...options,
    headers: {
      'Content-Type': 'text/plain',
    },
  })
/**
 * 校验旧密码是否正确
 * @param password 旧密码
 */
export const checkOldPassword_api = (password: string, options?: RequestOptions) =>
  request.post<PasswordValidation>(`/user/me/password/_validate`, password, {
    ...options,
    headers: {
      'Content-Type': 'text/plain',
    },
  })
