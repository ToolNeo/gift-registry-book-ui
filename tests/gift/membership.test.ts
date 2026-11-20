import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useSession } from '@/app/stores/session'
import { useMembership } from '@/modules/membership-manager-ui/stores/membership'
import { membershipApi } from '@/modules/membership-manager-ui/api'
import { useMembershipCenter } from '@/modules/membership-manager-ui/hooks/useMembershipCenter'
import { useMembershipManagement } from '@/modules/membership-manager-ui/hooks/useMembershipManagement'
import { useGiftEntitlements } from '@/modules/gift-registry-manager-ui/hooks/useGiftEntitlements'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { permissionKey } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { adaptMenus } from '@/app/router/menu-adapter'
import { i18n } from '@/shared/i18n'
import { locales } from '@/modules/membership-manager-ui/locales'
import { saved } from '@/shared/utils/feedback'
import type {
  AuthorizationCode,
  CodeDelivery,
  IssueResult,
  MembershipRecipient,
  MembershipStatus,
} from '@/modules/membership-manager-ui/types'

vi.mock('@/modules/membership-manager-ui/api', () => ({
  membershipApi: {
    me: vi.fn(),
    packages: vi.fn(),
    adminPackages: vi.fn(),
    history: vi.fn(),
    redeem: vi.fn(),
    accounts: vi.fn(),
    codes: vi.fn(),
    issue: vi.fn(),
    revoke: vi.fn(),
    reissue: vi.fn(),
    recipients: vi.fn(),
    delivery: vi.fn(),
  },
}))
vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  giftApi: { usage: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
i18n.global.mergeLocaleMessage('zh', { membership: locales.zh })
const now = 1_800_000_000_000
const free: MembershipStatus = {
  state: 'FREE',
  vip: false,
  unlimited: false,
  expiresAt: null,
  serverTime: now,
}
const vip: MembershipStatus = {
  state: 'VIP',
  vip: true,
  unlimited: true,
  expiresAt: now + 86400000,
  serverTime: now,
}
const emptyPage = { data: [], total: 0, pageIndex: 0, pageSize: 20 }
const recipient: MembershipRecipient = {
  userId: 'member-a',
  username: 'member-a',
  name: '用户甲',
  email: 'member@example.com',
}
const authorization: AuthorizationCode = {
  id: 'c',
  userId: 'member-a',
  username: 'member-a',
  packageId: 'DAY',
  days: 1,
  priceCents: 200,
  paymentReference: 'paid-1',
  status: 'UNUSED',
  issuedAt: now,
  redeemedAt: null,
  issuerName: '管理员',
  recipientEmail: recipient.email,
  deliveryStatus: 'SENDING',
}
async function chooseRecipient(
  manager: ReturnType<typeof useMembershipManagement>,
) {
  manager.openIssue()
  await manager.searchRecipients('member')
  manager.selectRecipient('member-a')
  Object.assign(manager.draft, { packageId: 'DAY', paymentReference: 'paid-1' })
}
const wrappers: ReturnType<typeof mount>[] = []
function session() {
  const session = useSession()
  session.user = {
    id: 'member-a',
    username: 'member-a',
    name: '用户甲',
    status: 1,
  }
  session.permissions = new Set(['membership:query', 'membership:redeem'])
  return session
}
function setup<T>(
  factory: () => T,
  actions = new Set([
    'membership:redeem',
    'membership-admin:issue',
    'membership-admin:revoke',
    'gift-registry:query',
    'gift-registry:save',
  ]),
  sessionActions = ['membership:query', 'membership:redeem'],
) {
  let result!: T
  const pinia = createPinia()
  setActivePinia(pinia)
  session().permissions = new Set(sessionActions)
  const wrapper = mount(
    defineComponent({
      setup() {
        result = factory()
        return () => h('div')
      },
    }),
    {
      global: {
        plugins: [pinia],
        provide: {
          [permissionKey as symbol]: {
            can: (value: string | string[]) =>
              (Array.isArray(value) ? value : [value]).some((item) =>
                actions.has(item),
              ),
          },
        },
      },
    },
  )
  wrappers.push(wrapper)
  return result
}
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  vi.mocked(membershipApi.me).mockResolvedValue(free)
  vi.mocked(membershipApi.packages).mockResolvedValue([
    { id: 'DAY', name: '日卡', days: 1, priceCents: 200 },
  ])
  vi.mocked(membershipApi.adminPackages).mockResolvedValue([
    { id: 'DAY', name: '日卡', days: 1, priceCents: 200 },
  ])
  vi.mocked(membershipApi.history).mockResolvedValue(emptyPage)
  vi.mocked(membershipApi.accounts).mockResolvedValue(emptyPage)
  vi.mocked(membershipApi.codes).mockResolvedValue(emptyPage)
  vi.mocked(membershipApi.recipients).mockResolvedValue([recipient])
  vi.mocked(giftApi.usage).mockResolvedValue({
    membership: free,
    ownedActivityCount: 1,
    activityLimit: 1,
    canCreateEvent: false,
    eventId: 'a',
    entryCount: 10,
    entryLimit: 10,
    canCreateEntry: false,
    ownerUnlimited: false,
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  useMembership().clear()
  vi.useRealTimers()
})

describe('membership identity and server expiry', () => {
  it('expires an open page without relogin and retains history ownership', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    session()
    vi.mocked(membershipApi.me)
      .mockResolvedValueOnce({ ...vip, expiresAt: now + 1000 })
      .mockResolvedValue(free)
    const member = useMembership()
    await member.load()
    expect(member.unlimited).toBe(true)
    await vi.advanceTimersByTimeAsync(1030)
    expect(member.unlimited).toBe(false)
    expect(membershipApi.me).toHaveBeenCalledTimes(2)
  })
  it('rejects a late response after logout and never caches another account entitlement', async () => {
    const identity = session()
    let resolve!: (value: MembershipStatus) => void
    vi.mocked(membershipApi.me).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const member = useMembership()
    const pending = member.load()
    identity.clear()
    resolve(vip)
    await pending
    expect(member.status).toBeUndefined()
    expect(member.packages).toEqual([])
    expect(member.unlimited).toBe(false)
  })
  it('does not create membership routes without configured menus', () => {
    expect(adaptMenus([]).routes).toEqual([])
    const configured = adaptMenus([
      {
        id: 'm',
        code: 'membership/Center',
        name: '我的会员',
        url: '/my-membership',
      },
    ])
    expect(configured.routes[0]?.path).toBe('/my-membership')
  })
})

describe('quota and action conjunction', () => {
  it('discards gift-scoped entitlement responses that arrive after logout', async () => {
    const value = await giftApi.usage()
    let resolve!: (result: typeof value) => void
    vi.mocked(giftApi.usage).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const entitlement = setup(
      () => useGiftEntitlements(ref('a')),
      new Set(['gift-registry:query']),
      ['gift-registry:query'],
    )
    useSession().clear()
    resolve({ ...value, membership: vip })
    await flushPromises()
    expect(entitlement.membership.status).toBeUndefined()
    expect(entitlement.usage.data.value).toBeUndefined()
  })
  it('uses gift-scoped actor membership for VIP features without the member-center permission', async () => {
    const value = await giftApi.usage()
    vi.mocked(giftApi.usage).mockResolvedValue({ ...value, membership: vip })
    const actions = new Set([
      'gift-registry:query',
      'gift-registry:save',
      'gift-registry:export',
      'gift-registry:backup',
      'gift-registry:restore',
    ])
    const entitlement = setup(() => useGiftEntitlements(ref('a')), actions, [
      ...actions,
    ])
    await flushPromises()
    expect(membershipApi.me).not.toHaveBeenCalled()
    expect(entitlement.canExport.value).toBe(true)
    expect(entitlement.canBackup.value).toBe(true)
    expect(entitlement.canRestore.value).toBe(true)
    expect(entitlement.canCreateEntry.value).toBe(false)
  })
  it('uses authoritative quota and requires the advanced action even for VIP', async () => {
    vi.mocked(membershipApi.me).mockResolvedValue(vip)
    const value = await giftApi.usage()
    vi.mocked(giftApi.usage).mockResolvedValue({ ...value, membership: vip })
    const actions = reactive(
      new Set(['gift-registry:query', 'gift-registry:save']),
    )
    const entitlement = setup(() => useGiftEntitlements(ref('a')), actions)
    await flushPromises()
    expect(entitlement.canCreateEvent.value).toBe(false)
    expect(entitlement.canCreateEntry.value).toBe(false)
    expect(entitlement.canExport.value).toBe(false)
    expect(entitlement.canBackup.value).toBe(false)
    actions.add('gift-registry:export')
    expect(entitlement.canExport.value).toBe(true)
    actions.delete('gift-registry:query')
    expect(entitlement.canExport.value).toBe(false)
  })
})

describe('redemption and issuance retry behavior', () => {
  it('loads admin packages without requiring personal membership query permission', async () => {
    const manager = setup(useMembershipManagement)
    useSession().permissions = new Set([
      'membership-admin:query',
      'membership-admin:issue',
    ])
    await flushPromises()
    expect(manager.packages.data.value[0]?.priceCents).toBe(200)
    expect(membershipApi.adminPackages).toHaveBeenCalledOnce()
    expect(membershipApi.me).not.toHaveBeenCalled()
  })
  it('retains the request identity after a failed redemption, then updates entitlement without relogin', async () => {
    const center = setup(useMembershipCenter)
    await flushPromises()
    const identity = useSession()
    vi.spyOn(identity, 'refreshAuthorization').mockResolvedValue()
    vi.mocked(membershipApi.redeem)
      .mockRejectedValueOnce(new ApiError('network', 0))
      .mockResolvedValueOnce(vip)
    center.draft.code = 'account-bound-code'
    await center.redeem()
    const requestId = vi.mocked(membershipApi.redeem).mock.calls[0]![1]
    expect(center.draft.code).toBe('account-bound-code')
    await center.redeem()
    expect(membershipApi.redeem).toHaveBeenLastCalledWith(
      'account-bound-code',
      requestId,
    )
    expect(center.draft.code).toBe('')
    expect(center.membership.unlimited).toBe(true)
    expect(identity.refreshAuthorization).toHaveBeenCalledOnce()
  })
  it('shows no plaintext for an idempotent replay and does not generate a second issue request identity', async () => {
    const manager = setup(useMembershipManagement)
    await flushPromises()
    vi.mocked(membershipApi.issue)
      .mockRejectedValueOnce(new ApiError('network', 0))
      .mockResolvedValueOnce({ authorization, code: null, replayed: true })
    await chooseRecipient(manager)
    await manager.issue()
    const first = vi.mocked(membershipApi.issue).mock.calls[0]![0]
    await manager.issue()
    expect(membershipApi.issue).toHaveBeenLastCalledWith(first)
    expect(manager.issued.value).toBeUndefined()
    expect(manager.notice.value).toBe(locales.zh.replayHint)
    expect(localStorage.length).toBe(0)
  })
})

describe('verified recipient selection and email delivery', () => {
  it('uses only issue grants and includes the selected verified email without loading query lists', async () => {
    const manager = setup(
      useMembershipManagement,
      new Set(['membership-admin:issue']),
      ['membership-admin:issue'],
    )
    vi.mocked(membershipApi.issue).mockResolvedValue({
      authorization: { ...authorization, deliveryStatus: 'SENT' },
      code: 'once',
      replayed: false,
    })
    await chooseRecipient(manager)
    await manager.issue()
    expect(membershipApi.recipients).toHaveBeenCalledWith(
      'member',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(membershipApi.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        username: recipient.username,
        email: recipient.email,
      }),
    )
    expect(membershipApi.accounts).not.toHaveBeenCalled()
    expect(membershipApi.codes).not.toHaveBeenCalled()
    expect(membershipApi.me).not.toHaveBeenCalled()
  })
  it('requires a selected verified email and changes request identity when that binding changes', async () => {
    const manager = setup(useMembershipManagement)
    vi.mocked(membershipApi.recipients).mockResolvedValueOnce([
      { ...recipient, email: null },
    ])
    await chooseRecipient(manager)
    await manager.issue()
    expect(membershipApi.issue).not.toHaveBeenCalled()
    expect(manager.task.error.value).toBe(locales.zh.verifiedEmailRequired)
    vi.mocked(membershipApi.issue).mockRejectedValue(new ApiError('network', 0))
    await manager.searchRecipients('member')
    manager.selectRecipient('member-a')
    await manager.issue()
    const first = vi.mocked(membershipApi.issue).mock.calls[0]![0]
    await manager.issue()
    expect(membershipApi.issue).toHaveBeenLastCalledWith(first)
    vi.mocked(membershipApi.recipients).mockResolvedValue([
      { ...recipient, email: 'changed@example.com' },
    ])
    await manager.searchRecipients('member')
    manager.selectRecipient('member-a')
    await manager.issue()
    const changed = vi.mocked(membershipApi.issue).mock.calls[2]![0]
    expect(changed.email).toBe('changed@example.com')
    expect(changed.requestId).not.toBe(first.requestId)
  })
  it('aborts old searches and ignores late recipients after a newer search or dialog close', async () => {
    const manager = setup(useMembershipManagement)
    manager.openIssue()
    let resolve!: (rows: MembershipRecipient[]) => void
    vi.mocked(membershipApi.recipients).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const old = manager.searchRecipients('old')
    const signal = vi.mocked(membershipApi.recipients).mock.calls[0]![1]!
      .signal!
    await manager.searchRecipients('member')
    manager.selectRecipient('member-a')
    resolve([{ ...recipient, username: 'old-user' }])
    await old
    expect(signal.aborted).toBe(true)
    expect(manager.draft.email).toBe(recipient.email)
    expect(manager.recipients.rows.value[0]?.username).toBe('member-a')
    manager.closeIssue()
    expect(manager.draft.email).toBe('')
    expect(manager.recipients.rows.value).toEqual([])
  })
  it('shows SENDING without an email-success toast and stops polling after SMTP accepts the email', async () => {
    vi.useFakeTimers()
    const manager = setup(useMembershipManagement)
    vi.mocked(membershipApi.issue).mockResolvedValue({
      authorization,
      code: 'once',
      replayed: false,
    })
    vi.mocked(membershipApi.delivery)
      .mockResolvedValueOnce({
        codeId: 'c',
        recipientEmail: recipient.email,
        deliveryStatus: 'SENDING',
      })
      .mockResolvedValueOnce({
        codeId: 'c',
        recipientEmail: recipient.email,
        deliveryStatus: 'SENT',
      })
    await chooseRecipient(manager)
    await manager.issue()
    expect(saved).not.toHaveBeenCalledWith(locales.zh.emailSent)
    await vi.advanceTimersByTimeAsync(3000)
    expect(manager.issued.value?.authorization.deliveryStatus).toBe('SENT')
    expect(saved).toHaveBeenCalledWith(locales.zh.emailSent)
    await vi.advanceTimersByTimeAsync(9000)
    expect(membershipApi.delivery).toHaveBeenCalledTimes(2)
  })
  it.each(['close', 'account', 'unmount'])(
    'clears private recipient searches on %s before a late response',
    async (action) => {
      const manager = setup(useMembershipManagement)
      manager.openIssue()
      let resolve!: (rows: MembershipRecipient[]) => void
      vi.mocked(membershipApi.recipients).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      const pending = manager.searchRecipients('member')
      const signal = vi.mocked(membershipApi.recipients).mock.calls[0]![1]!
        .signal!
      if (action === 'close') manager.closeIssue()
      if (action === 'account') useSession().clear()
      if (action === 'unmount') wrappers.at(-1)!.unmount()
      resolve([recipient])
      await pending
      expect(signal.aborted).toBe(true)
      expect(manager.recipients.rows.value).toEqual([])
      expect(manager.recipients.selected.value).toBeUndefined()
      expect(manager.draft.email).toBe('')
    },
  )
  it('keeps one-time plaintext hidden when issuance completes after the form was closed', async () => {
    const manager = setup(useMembershipManagement)
    let resolve!: (result: IssueResult) => void
    vi.mocked(membershipApi.issue).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await chooseRecipient(manager)
    const pending = manager.issue()
    manager.closeIssue()
    resolve({ authorization, code: 'late-secret', replayed: false })
    await pending
    expect(manager.issued.value).toBeUndefined()
    expect(manager.draft.email).toBe('')
    expect(saved).not.toHaveBeenCalled()
  })
  it('retains the issued result during a failed status request and retries without another issuance', async () => {
    vi.useFakeTimers()
    const manager = setup(useMembershipManagement)
    vi.mocked(membershipApi.delivery)
      .mockRejectedValueOnce(new ApiError('offline', 0))
      .mockResolvedValueOnce({
        codeId: 'c',
        recipientEmail: recipient.email,
        deliveryStatus: 'SENT',
      })
    manager.issued.value = { authorization, code: 'once', replayed: false }
    await vi.advanceTimersByTimeAsync(1500)
    expect(manager.delivery.error.value).toBe(locales.zh.deliveryQueryFailed)
    expect(manager.issued.value?.code).toBe('once')
    await manager.delivery.refresh()
    expect(manager.delivery.error.value).toBe('')
    expect(manager.issued.value?.authorization.deliveryStatus).toBe('SENT')
    expect(membershipApi.issue).not.toHaveBeenCalled()
  })
  it('retains the issued code on delivery failure and reissues from its existing order without issuing again', async () => {
    vi.useFakeTimers()
    const manager = setup(useMembershipManagement)
    vi.mocked(membershipApi.issue).mockResolvedValue({
      authorization,
      code: 'once',
      replayed: false,
    })
    vi.mocked(membershipApi.delivery).mockResolvedValue({
      codeId: 'c',
      recipientEmail: recipient.email,
      deliveryStatus: 'FAILED',
    })
    await chooseRecipient(manager)
    await manager.issue()
    await vi.advanceTimersByTimeAsync(1500)
    expect(manager.issued.value?.code).toBe('once')
    expect(manager.issued.value?.authorization.deliveryStatus).toBe('FAILED')
    expect(saved).not.toHaveBeenCalledWith(locales.zh.emailSent)
    vi.mocked(membershipApi.reissue).mockResolvedValue({
      authorization: {
        ...authorization,
        id: 'new-code',
        deliveryStatus: 'SENT',
      },
      code: 'new-once',
      replayed: false,
    })
    manager.closeIssued()
    await manager.reissue(authorization)
    expect(membershipApi.issue).toHaveBeenCalledOnce()
    expect(membershipApi.reissue).toHaveBeenCalledWith('c', expect.any(String))
    expect(manager.issued.value?.code).toBe('new-once')
  })
  it.each(['close', 'account', 'unmount'])(
    'stops polling and discards late delivery on %s',
    async (action) => {
      vi.useFakeTimers()
      const manager = setup(useMembershipManagement)
      let resolve!: (status: CodeDelivery) => void
      vi.mocked(membershipApi.delivery).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      manager.issued.value = { authorization, code: 'once', replayed: false }
      await vi.advanceTimersByTimeAsync(1500)
      const signal = vi.mocked(membershipApi.delivery).mock.calls[0]![1]!
        .signal!
      if (action === 'close') manager.closeIssued()
      if (action === 'account') useSession().clear()
      if (action === 'unmount') wrappers.at(-1)!.unmount()
      resolve({
        codeId: 'c',
        recipientEmail: recipient.email,
        deliveryStatus: 'SENT',
      })
      await flushPromises()
      expect(signal.aborted).toBe(true)
      expect(saved).not.toHaveBeenCalledWith(locales.zh.emailSent)
      await vi.advanceTimersByTimeAsync(9000)
      expect(membershipApi.delivery).toHaveBeenCalledOnce()
      if (action === 'account') {
        expect(manager.issued.value).toBeUndefined()
        expect(manager.draft.email).toBe('')
      }
    },
  )
})
