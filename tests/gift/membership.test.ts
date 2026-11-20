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
import type { MembershipStatus } from '@/modules/membership-manager-ui/types'

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
    const authorization = {
      id: 'c',
      userId: 'member-a',
      username: 'member-a',
      packageId: 'DAY' as const,
      days: 1,
      priceCents: 200,
      paymentReference: 'paid-1',
      status: 'UNUSED' as const,
      issuedAt: now,
      redeemedAt: null,
      issuerName: '管理员',
    }
    vi.mocked(membershipApi.issue)
      .mockRejectedValueOnce(new ApiError('network', 0))
      .mockResolvedValueOnce({ authorization, code: null, replayed: true })
    Object.assign(manager.draft, {
      username: 'member-a',
      packageId: 'DAY',
      paymentReference: 'paid-1',
    })
    await manager.issue()
    const first = vi.mocked(membershipApi.issue).mock.calls[0]![0]
    await manager.issue()
    expect(membershipApi.issue).toHaveBeenLastCalledWith(first)
    expect(manager.issued.value).toBeUndefined()
    expect(manager.notice.value).toBe(locales.zh.replayHint)
    expect(localStorage.length).toBe(0)
  })
})
