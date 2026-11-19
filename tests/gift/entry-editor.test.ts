import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { useEntryEditor } from '@/modules/gift-registry-manager-ui/hooks/useEntryEditor'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { locales } from '@/modules/gift-registry-manager-ui/locales'
i18n.global.mergeLocaleMessage('zh', { gift: locales.zh })
import type { GiftEntry } from '@/modules/gift-registry-manager-ui/types'

vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  giftApi: { duplicates: vi.fn(), createEntry: vi.fn(), updateEntry: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
const row: GiftEntry = {
  id: 'e1',
  eventId: 'a',
  seq: 1,
  name: '张三',
  amountCents: 123,
  paymentMethod: 'WECHAT',
  attendeeCount: null,
  remark: '',
  status: 'VOID',
  version: 1,
  requestId: 'r1',
  createdAt: 1,
  updatedAt: 1,
}
const wrappers: ReturnType<typeof mount>[] = []

function setup() {
  const eventId = ref('a')
  const afterSave = vi.fn(async () => {})
  let editor!: ReturnType<typeof useEntryEditor>
  const wrapper = mount(
    defineComponent({
      setup() {
        editor = useEntryEditor(eventId, afterSave)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  Object.assign(editor.draft, {
    name: ' 张三 ',
    amount: '1.23',
    paymentMethod: 'WECHAT',
    attendeeCount: 0,
  })
  return { editor, eventId, afterSave }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(giftApi.duplicates).mockResolvedValue([])
  vi.mocked(giftApi.createEntry).mockResolvedValue({ ...row, status: 'VALID' })
  vi.mocked(giftApi.updateEntry).mockResolvedValue({ ...row, status: 'VALID' })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('registration boundary', () => {
  it('warns on current-event voided matches and saves a separate record only after confirmation', async () => {
    const { editor } = setup()
    vi.mocked(giftApi.duplicates).mockResolvedValue([row])
    expect(await editor.submit()).toBe(false)
    expect(giftApi.duplicates).toHaveBeenLastCalledWith(
      'a',
      ' 张三 ',
      undefined,
      expect.any(Object),
    )
    expect(editor.duplicates.value[0]?.status).toBe('VOID')
    expect(giftApi.createEntry).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    expect(await editor.submit(true)).toBe(true)
    expect(giftApi.createEntry).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        name: '张三',
        amountCents: 123,
        paymentMethod: 'WECHAT',
        attendeeCount: 0,
      }),
    )
  })

  it('preserves the payload and request identity after a lost response, and does not run a second duplicate query on retry', async () => {
    const { editor } = setup()
    vi.mocked(giftApi.createEntry).mockRejectedValueOnce(
      new ApiError('Offline', 0),
    )
    expect(await editor.submit()).toBe(false)
    expect(editor.uncertain.value).toBe(true)
    expect(saved).not.toHaveBeenCalled()
    const first = vi.mocked(giftApi.createEntry).mock.calls[0]
    expect(await editor.submit()).toBe(true)
    expect(vi.mocked(giftApi.createEntry).mock.calls[1]).toEqual(first)
    expect(giftApi.duplicates).toHaveBeenCalledTimes(1)
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.savedEntry)
  })

  it('keeps a failed duplicate check editable and checks again before creating', async () => {
    const { editor } = setup()
    vi.mocked(giftApi.duplicates).mockRejectedValueOnce(
      new ApiError('Lookup failed', 500),
    )
    expect(await editor.submit()).toBe(false)
    expect(giftApi.createEntry).not.toHaveBeenCalled()
    expect(editor.uncertain.value).toBe(false)
    expect(saved).not.toHaveBeenCalled()
    editor.draft.name = '另一位宾客'
    expect(await editor.submit()).toBe(true)
    expect(giftApi.duplicates).toHaveBeenCalledTimes(2)
    expect(giftApi.duplicates).toHaveBeenLastCalledWith(
      'a',
      '另一位宾客',
      undefined,
      expect.any(Object),
    )
    expect(giftApi.createEntry).toHaveBeenCalledExactlyOnceWith(
      'a',
      expect.objectContaining({ name: '另一位宾客' }),
    )
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.savedEntry)
  })

  it('keeps unregistered null distinct from zero and excludes the edited row from duplicate detection', async () => {
    const { editor } = setup()
    editor.reset({ ...row, status: 'VALID' })
    editor.draft.reason = '修正人数'
    expect(await editor.submit()).toBe(true)
    expect(giftApi.duplicates).toHaveBeenLastCalledWith(
      'a',
      '张三',
      'e1',
      expect.any(Object),
    )
    expect(giftApi.updateEntry).toHaveBeenCalledWith(
      'a',
      'e1',
      expect.objectContaining({
        attendeeCount: null,
        expectedVersion: 1,
        reason: '修正人数',
      }),
    )
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.correctedEntry)
  })

  it('does not treat a failed refresh as an uncertain or failed write', async () => {
    const { editor, afterSave } = setup()
    afterSave.mockRejectedValueOnce(
      new Error('Read failed after committed write'),
    )
    expect(await editor.submit()).toBe(true)
    expect(giftApi.createEntry).toHaveBeenCalledTimes(1)
    expect(editor.uncertain.value).toBe(false)
    expect(editor.draft.name).toBe('')
    expect(editor.error.value).toBe(locales.zh.refreshError)
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.savedEntry)
  })

  it('does not save fractional attendance or rounded money and clears warnings on activity changes', async () => {
    const { editor, eventId } = setup()
    editor.draft.attendeeCount = 1.5
    expect(await editor.submit()).toBe(false)
    editor.draft.attendeeCount = null
    editor.draft.amount = '1.234'
    expect(await editor.submit()).toBe(false)
    expect(giftApi.createEntry).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    editor.duplicates.value = [row]
    eventId.value = 'b'
    await vi.advanceTimersByTimeAsync(1)
    expect(editor.draft.name).toBe('')
    expect(editor.duplicates.value).toEqual([])
  })
})
