export interface LoginInput {
  username: string
  password: string
  expires: number
  verifyCode?: string
  verifyKey?: string
  encryptId?: string
}

export interface LoginConfig {
  encrypt?: { enabled: boolean; publicKey: string; id: string }
}

export interface EmailCodeChallenge {
  challengeId: string
  expiresIn: number
  resendAfter: number
  maskedEmail: string
  deliveryStatus?: 'SENDING' | 'SENT'
}

export interface EmailDeliveryStatus {
  status: 'SENDING' | 'SENT' | 'FAILED' | 'EXPIRED'
  expiresIn: number
}

export interface RegistrationInput extends EmailCaptchaProof {
  username: string
  name: string
  password: string
  email: string
  challengeId: string
  code: string
}

export interface EmailCaptchaProof {
  verifyKey: string
  verifyCode: string
}
