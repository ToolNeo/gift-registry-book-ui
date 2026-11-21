export type MembershipState = 'FREE' | 'VIP' | 'EXEMPT'
export interface MembershipStatus {
  state: MembershipState
  vip: boolean
  unlimited: boolean
  expiresAt: number | null
  serverTime: number
}
export type PackageId = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER'
export interface MembershipPackage {
  id: PackageId
  name: string
  priceCents: number
  days: number
}
export interface MembershipStatistics {
  asOf: number
  timeZone: 'Asia/Shanghai'
  expiringWithinDays: number
  activeVipCount: number
  expiringSoonCount: number
  expiredVipCount: number
  confirmedOrderCount: number
  paidUserCount: number
  totalConfirmedCents: number
  todayConfirmedCents: number
  monthConfirmedCents: number
  unusedCodeCount: number
  redeemedCodeCount: number
  revokedCodeCount: number
  packages: {
    packageId: PackageId
    confirmedOrderCount: number
    confirmedCents: number
  }[]
}
export interface MembershipHistory {
  id: string
  packageId: PackageId
  days: number
  priceCents: number
  beforeExpiresAt: number | null
  afterExpiresAt: number
  redeemedAt: number
}
export interface MembershipAccount {
  userId: string
  username: string
  name: string
  state: MembershipState
  expiresAt: number | null
}
export interface MembershipRecipient {
  userId: string
  username: string
  name: string
  email: string | null
}
export type DeliveryStatus = 'NOT_SENT' | 'SENDING' | 'SENT' | 'FAILED'
export interface CodeDelivery {
  codeId: string
  recipientEmail: string | null
  deliveryStatus: DeliveryStatus
}
export interface AuthorizationCode {
  id: string
  userId: string
  username: string
  packageId: PackageId
  days: number
  priceCents: number
  paymentReference: string
  status: 'UNUSED' | 'REDEEMED' | 'REVOKED'
  issuedAt: number
  redeemedAt: number | null
  issuerName: string
  recipientEmail: string | null
  deliveryStatus: DeliveryStatus
}
export interface IssueInput {
  username: string
  packageId: PackageId
  paymentReference: string
  requestId: string
  email?: string
}
/** Plaintext is returned only for the first successful issuance and stays in a local modal. */
export interface IssueResult {
  authorization: AuthorizationCode
  code: string | null
  replayed: boolean
}
