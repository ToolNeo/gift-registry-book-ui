import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useEventManagement } from '@/modules/gift-registry-manager-ui/hooks/useEventManagement'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { permissionKey } from '@/shared/auth/provider'
import { saved } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { locales } from '@/modules/gift-registry-manager-ui/locales'
import { protectedRoutes } from '@/modules/gift-registry-manager-ui/routes'
import { adaptMenus } from '@/app/router/menu-adapter'
import type { ServerMenu } from '@/shared/auth/types'
import type { Query } from '@/shared/api/types'
import type { GiftEvent } from '@/modules/gift-registry-manager-ui/types'

vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  giftApi: { events: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
i18n.global.mergeLocaleMessage('zh', { gift: locales.zh })
const original: GiftEvent = {
  id: 'a',
  name: '喜宴',
  eventDate: '2026-11-18',
  eventType: 'WEDDING',
  description: '亲友欢聚',
  status: 'ACTIVE',
  version: 12,
  createdAt: 1,
  updatedAt: 1,
}
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
async function setup(
  actions = ['query', 'save', 'delete'],
  initial: GiftEvent = { ...original },
) {
  let stored: GiftEvent | undefined = initial
  vi.mocked(giftApi.events).mockImplementation(async () => ({
    data: stored ? [stored] : [],
    total: stored ? 1 : 0,
    pageIndex: 0,
    pageSize: 20,
  }))
  vi.mocked(giftApi.updateEvent).mockImplementation(
    async (_id, input) =>
      (stored = { ...stored!, ...input, version: stored!.version + 1 }),
  )
  vi.mocked(giftApi.deleteEvent).mockImplementation(async () => {
    stored = undefined
    return true
  })
  let manager!: ReturnType<typeof useEventManagement>
  const wrapper = mount(
    defineComponent({
      setup() {
        manager = useEventManagement()
        return () => h('div')
      },
    }),
    {
      global: {
        provide: {
          [permissionKey as symbol]: {
            can: (permission: string) =>
              actions.includes(permission.split(':')[1]!),
          },
        },
      },
    },
  )
  wrappers.push(wrapper)
  await flushPromises()
  return manager
}

describe('activity lifecycle management boundaries', () => {
  it('keeps shared grouped conditions across paging, ignores saved pages and resets on an empty search', async () => {
    const manager = await setup(['query'])
    const query: Query = {
      terms: [
        {
          terms: [
            { column: 'name', termType: 'like', value: '%喜宴%' },
            { type: 'or', column: 'status', termType: 'eq', value: 'CLOSED' },
          ],
        },
      ],
      pageIndex: 99,
      pageSize: 1,
    }
    await manager.search(query)
    const expected = structuredClone(query.terms)
    expect(giftApi.events).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paging: true,
        pageIndex: 0,
        pageSize: 20,
        terms: expected,
      }),
      expect.anything(),
    )
    query.terms![0]!.terms![0]!.value = '尚未执行的草稿'
    await manager.page(2, 20)
    expect(giftApi.events).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 1, pageSize: 20, terms: expected }),
      expect.anything(),
    )
    await manager.search({ terms: [] })
    expect(giftApi.events).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 0, terms: [] }),
      expect.anything(),
    )
  })
  it('lists with query permission but sends no writes without their separate permissions', async () => {
    const manager = await setup(['query'])
    expect(manager.rows.value).toHaveLength(1)
    await manager.changeStatus(manager.rows.value[0]!)
    await manager.remove({ ...original, status: 'CLOSED' })
    expect(giftApi.updateEvent).not.toHaveBeenCalled()
    expect(giftApi.deleteEvent).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
  })
  it('never deletes ACTIVE or changes missing legacy descriptions, and uses returned versions for close/reopen', async () => {
    const manager = await setup()
    await manager.remove(original)
    await manager.changeStatus({ ...original, description: '' })
    expect(giftApi.deleteEvent).not.toHaveBeenCalled()
    expect(giftApi.updateEvent).not.toHaveBeenCalled()
    await manager.changeStatus(manager.rows.value[0]!)
    expect(giftApi.updateEvent).toHaveBeenNthCalledWith(1, 'a', {
      name: original.name,
      eventDate: original.eventDate,
      eventType: 'WEDDING',
      description: original.description,
      status: 'CLOSED',
      expectedVersion: 12,
    })
    expect(manager.rows.value[0]!.version).toBe(13)
    expect(saved).toHaveBeenLastCalledWith(locales.zh.closedEvent)
    await manager.changeStatus(manager.rows.value[0]!)
    expect(giftApi.updateEvent).toHaveBeenNthCalledWith(
      2,
      'a',
      expect.objectContaining({ status: 'ACTIVE', expectedVersion: 13 }),
    )
    expect(saved).toHaveBeenLastCalledWith(locales.zh.reopenedEvent)
  })
  it('keeps credentials and feedback unchanged on a rejected deletion, then clears both caches only on success', async () => {
    const manager = await setup(['query', 'delete'], {
      ...original,
      status: 'CLOSED',
    })
    localStorage.setItem('gift-registry:display-link:a', 'saved-link')
    sessionStorage.setItem('gift-registry:display:a', 'saved-token')
    vi.mocked(giftApi.deleteEvent).mockRejectedValueOnce(
      new Error('VERSION_CONFLICT'),
    )
    await manager.remove(manager.rows.value[0]!)
    expect(giftApi.deleteEvent).toHaveBeenCalledWith('a', 12)
    expect(localStorage.getItem('gift-registry:display-link:a')).toBe(
      'saved-link',
    )
    expect(saved).not.toHaveBeenCalled()
    await manager.remove(manager.rows.value[0]!)
    expect(localStorage.getItem('gift-registry:display-link:a')).toBeNull()
    expect(sessionStorage.getItem('gift-registry:display:a')).toBeNull()
    expect(manager.rows.value).toEqual([])
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.deletedEvent)
  })
  it('never invents an activity management menu or a static route when no menu is configured', () => {
    expect(
      protectedRoutes.some((route) => route.path === '/gift-registry/events'),
    ).toBe(false)
    expect(adaptMenus([])).toEqual({ routes: [], links: [] })
  })
  it('uses the configured management menu name, URL and position without adding a duplicate', () => {
    const server = [
      {
        id: 'server',
        code: 'gift-registry/Manage',
        url: '/activities',
        name: '自定义活动列表',
        sortIndex: 7,
      },
    ]
    const { routes, links } = adaptMenus(server)
    expect(links).toHaveLength(1)
    expect(
      routes.find(
        (route) => route.meta?.menuComponentCode === 'gift-registry/Manage',
      ),
    ).toMatchObject({
      path: '/activities',
      name: 'menu:server',
      meta: { title: '自定义活动列表' },
    })
    expect(links.at(-1)).toMatchObject({
      key: '/activities',
      title: '自定义活动列表',
    })
    expect(routes.some((route) => route.path === '/gift-registry/events')).toBe(
      false,
    )
  })
  it('does not expose hidden or denied management menus or their routes', () => {
    for (const extra of [{ options: { show: false } }, { granted: false }]) {
      const server: ServerMenu[] = [
        {
          id: 'server',
          code: 'gift-registry/Manage',
          url: '/gift-registry/events',
          name: '活动管理',
          ...extra,
        },
      ]
      const { routes, links } = adaptMenus(server)
      expect(
        routes.some(
          (route) => route.meta?.menuComponentCode === 'gift-registry/Manage',
        ),
      ).toBe(false)
      expect(links.some((link) => link.code === 'gift-registry/Manage')).toBe(
        false,
      )
    }
  })
})
