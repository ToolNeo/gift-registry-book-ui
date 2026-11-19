import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { useWorkspace } from '@/modules/gift-registry-manager-ui/hooks/useWorkspace'
import type { GiftEvent } from '@/modules/gift-registry-manager-ui/types'
import { download } from '@/shared/api/client'
import { saved } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { locales } from '@/modules/gift-registry-manager-ui/locales'
import type { Query } from '@/shared/api/types'

vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  giftApi: {
    events: vi.fn(),
    event: vi.fn(),
    settings: vi.fn(),
    summary: vi.fn(),
    entries: vi.fn(),
    exportEntries: vi.fn(),
  },
}))
vi.mock('@/shared/api/client', () => ({ download: vi.fn() }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
i18n.global.mergeLocaleMessage('zh', { gift: locales.zh })
beforeEach(() => vi.resetAllMocks())

function mountWorkspace(preferredId?: string) {
  let workspace!: ReturnType<typeof useWorkspace>
  const wrapper = mount(
    defineComponent({
      setup() {
        workspace = useWorkspace(preferredId)
        return () => h('div')
      },
    }),
  )
  return { workspace, wrapper }
}

it('collects event choices with the actual bounded paging contract instead of paging:false', async () => {
  const first: GiftEvent = {
    id: 'e0',
    name: '活动',
    eventDate: '2026-10-19',
    eventType: 'WEDDING',
    description: '',
    status: 'ACTIVE',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  }
  vi.mocked(giftApi.events).mockImplementation(async (query) => {
    if (!query?.paging || query.pageSize !== 200)
      throw new Error('Invalid real service paging shape')
    return {
      data: Array.from({ length: query.pageIndex === 0 ? 200 : 1 }, (_, i) => ({
        ...first,
        id: `e${(query.pageIndex || 0) * 200 + i}`,
      })),
      total: 201,
      pageIndex: query.pageIndex || 0,
      pageSize: 200,
    }
  })
  vi.mocked(giftApi.event).mockResolvedValue(first)
  vi.mocked(giftApi.settings).mockResolvedValue({
    title: '',
    photoDataUrl: null,
    columnsPerPage: 12,
    version: 1,
  })
  vi.mocked(giftApi.summary).mockResolvedValue({
    totalAmountCents: 0,
    totalEntries: 0,
    cashAmountCents: 0,
    wechatAmountCents: 0,
    totalAttendees: 0,
    unregisteredAttendeeEntries: 0,
  })
  vi.mocked(giftApi.entries).mockResolvedValue({
    data: [],
    total: 0,
    pageIndex: 0,
    pageSize: 20,
  })
  const { workspace, wrapper } = mountWorkspace()
  await flushPromises()
  expect(workspace.events.value).toHaveLength(201)
  expect(giftApi.events).toHaveBeenCalledTimes(2)
  expect(giftApi.events).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ pageIndex: 1, pageSize: 200, paging: true }),
  )
  wrapper.unmount()
})

const event: GiftEvent = {
  id: 'a',
  name: '活动A',
  eventDate: '2026-11-18',
  eventType: 'WEDDING',
  description: '亲友喜宴',
  status: 'ACTIVE',
  version: 2,
  createdAt: 1,
  updatedAt: 1,
}
async function setup(preferredId?: string) {
  vi.mocked(giftApi.events).mockResolvedValue({
    data: [event],
    total: 1,
    pageIndex: 0,
    pageSize: 200,
  })
  vi.mocked(giftApi.event).mockResolvedValue(event)
  vi.mocked(giftApi.settings).mockResolvedValue({
    title: '喜宴',
    photoDataUrl: null,
    columnsPerPage: 12,
    version: 2,
  })
  vi.mocked(giftApi.summary).mockResolvedValue({
    totalAmountCents: 0,
    totalEntries: 0,
    cashAmountCents: 0,
    wechatAmountCents: 0,
    totalAttendees: 0,
    unregisteredAttendeeEntries: 0,
  })
  vi.mocked(giftApi.entries).mockResolvedValue({
    data: [],
    total: 45,
    pageIndex: 0,
    pageSize: 20,
  })
  const { workspace, wrapper } = mountWorkspace(preferredId)
  await flushPromises()
  return { workspace, wrapper }
}

it('exports all entries matching the applied filters, without page fields or unsubmitted filter edits', async () => {
  const { workspace, wrapper } = await setup()
  const criteria: Query = {
    terms: [
      { column: 'name', termType: 'like', value: '%张%' },
      { column: 'status', termType: 'eq', value: 'VALID' },
      { column: 'paymentMethod', termType: 'eq', value: 'WECHAT' },
      {
        column: 'createdAt',
        termType: 'btw',
        value: [1793462400000, 1795017599999],
      },
    ],
    pageIndex: 99,
    pageSize: 1,
  }
  await workspace.search(criteria)
  expect(giftApi.entries).toHaveBeenLastCalledWith(
    'a',
    expect.objectContaining({ pageIndex: 0, pageSize: 20 }),
    expect.anything(),
  )
  await workspace.page(2, 20)
  const applied = vi.mocked(giftApi.entries).mock.calls.at(-1)![1].terms
  criteria.terms![0]!.value = '未搜索的草稿'
  const binary = {
    blob: new Blob(['PK']),
    filename: 'gift-entries.xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  vi.mocked(giftApi.exportEntries).mockResolvedValue(binary)
  await workspace.exportEntries()
  expect(giftApi.exportEntries).toHaveBeenCalledExactlyOnceWith('a', {
    paging: false,
    terms: applied,
  })
  expect(applied).toContainEqual({
    column: 'name',
    termType: 'like',
    value: '%张%',
  })
  expect(download).toHaveBeenCalledExactlyOnceWith(binary)
  expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.exportedEntries)
  vi.mocked(giftApi.exportEntries).mockRejectedValueOnce(
    new Error('EXPORT_TOO_LARGE'),
  )
  await workspace.exportEntries()
  expect(workspace.exportTask.error.value).toBe('EXPORT_TOO_LARGE')
  expect(download).toHaveBeenCalledTimes(1)
  expect(saved).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('preserves grouped shared conditions across paging and resets them for a new activity', async () => {
  const { workspace, wrapper } = await setup()
  const criteria: Query = {
    terms: [
      {
        terms: [
          { column: 'name', termType: 'like', value: '%张%' },
          {
            type: 'or',
            column: 'paymentMethod',
            termType: 'eq',
            value: 'WECHAT',
          },
        ],
      },
      { type: 'and', column: 'status', termType: 'eq', value: 'VALID' },
    ],
  }
  await workspace.search(criteria)
  const expected = structuredClone(criteria.terms)
  criteria.terms![0]!.terms![0]!.value = '未提交的修改'
  await workspace.page(2, 20)
  expect(vi.mocked(giftApi.entries).mock.calls.at(-1)![1]).toMatchObject({
    terms: expected,
    pageIndex: 1,
  })
  await workspace.search({ terms: [] })
  expect(vi.mocked(giftApi.entries).mock.calls.at(-1)![1]).toMatchObject({
    terms: [],
    pageIndex: 0,
  })
  await workspace.search({ terms: expected })
  await workspace.select('b')
  expect(vi.mocked(giftApi.entries).mock.calls.at(-1)!.slice(0, 2)).toEqual([
    'b',
    expect.objectContaining({ terms: [], pageIndex: 0 }),
  ])
  wrapper.unmount()
})

it('clears a removed preferred activity and does not keep its selection when choices become empty', async () => {
  const { workspace, wrapper } = await setup('removed')
  expect(workspace.eventId.value).toBe('a')
  expect(giftApi.event).not.toHaveBeenCalledWith('removed', expect.anything())
  vi.mocked(giftApi.events).mockResolvedValueOnce({
    data: [],
    total: 0,
    pageIndex: 0,
    pageSize: 200,
  })
  await workspace.loadEvents()
  expect(workspace.eventId.value).toBe('')
  expect(workspace.event.value).toBeUndefined()
  expect(workspace.settings.value).toBeUndefined()
  wrapper.unmount()
})
