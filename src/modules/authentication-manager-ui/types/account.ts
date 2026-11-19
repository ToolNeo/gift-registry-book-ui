import type { EmailCaptchaProof } from './auth'

export interface AvatarCrop {
  zoom: number
  horizontal: number
  vertical: number
}
export interface PasswordChangeInput extends EmailCaptchaProof {
  oldPassword: string
  newPassword: string
  challengeId: string
  code: string
}
export interface PasswordChangeDraft {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}
export interface BoundEmail {
  bound: boolean
  maskedEmail?: string
}
export interface EmailBindingInput {
  email: string
  oldPassword: string
  challengeId: string
  code: string
}
export interface PasswordValidation {
  passed: boolean
  reason?: string
}
export type PasswordChangeStep = 0 | 1 | 2
