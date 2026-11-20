export type PaymentMethod = 'CASH' | 'WECHAT'
export type EntryStatus = 'VALID' | 'VOID'
export type EventType =
  | 'WEDDING'
  | 'FUNERAL'
  | 'BIRTHDAY'
  | 'FULL_MOON'
  | 'HUNDRED_DAYS'
  | 'FIRST_BIRTHDAY'
  | 'ENGAGEMENT'
  | 'HOUSEWARMING'
  | 'GRADUATION'
  | 'BUSINESS_OPENING'

export interface GiftEvent {
  id: string
  creatorName?: string | null
  name: string
  eventDate: string
  eventType: EventType
  description: string
  status: 'ACTIVE' | 'CLOSED'
  version: number
  createdAt: number
  updatedAt: number
}

export interface GiftEntry {
  id: string
  creatorName?: string | null
  eventId: string
  seq: number
  name: string
  amountCents: number
  paymentMethod: PaymentMethod
  attendeeCount: number | null
  remark: string
  status: EntryStatus
  version: number
  requestId: string
  createdAt: number
  updatedAt: number
}

export interface EntryInput {
  name: string
  amountCents: number
  paymentMethod: PaymentMethod
  attendeeCount: number | null
  remark: string
}

export interface EntryDraft {
  name: string
  amount: string
  paymentMethod: PaymentMethod
  attendeeCount: number | null
  remark: string
  reason: string
}

export interface GiftSummary {
  totalAmountCents: number
  totalEntries: number
  cashAmountCents: number
  wechatAmountCents: number
  totalAttendees: number
  unregisteredAttendeeEntries: number
}

export interface DisplaySettings {
  title: string
  photoDataUrl: string | null
  columnsPerPage: number
  version: number
}

export interface EntryAudit {
  id: string
  entryId: string
  eventId: string
  action: string
  beforeJson: string | null
  afterJson: string | null
  actorId: string
  actorName: string | null
  reason: string | null
  createdAt: number
}

export interface DisplayEntry {
  id: string
  seq: number
  name: string
  amountCents: number
}

export interface DisplaySnapshot {
  latestEntrySeq: number
  event: Pick<
    GiftEvent,
    'id' | 'name' | 'eventDate' | 'eventType' | 'description'
  >
  settings: Omit<DisplaySettings, 'version'>
  version: number
  entries: DisplayEntry[]
  total: number
  pageIndex: number
  pageSize: number
}

export interface BackupBundle {
  schemaVersion: 1 | 2
  event: GiftEvent
  settings: DisplaySettings
  entries: GiftEntry[]
  audits: EntryAudit[]
}
/** Server-owned quota counts include closed activities and voided entries. */
export interface GiftUsage {
  membership: MembershipStatus
  ownedActivityCount: number
  activityLimit: number | null
  canCreateEvent: boolean
  eventId: string | null
  entryCount: number | null
  entryLimit: number | null
  canCreateEntry: boolean
  ownerUnlimited: boolean
}
import type { MembershipStatus } from '@/modules/membership-manager-ui'
