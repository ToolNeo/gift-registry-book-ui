import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { useEventSettings } from '@/modules/gift-registry-manager-ui/hooks/useEventSettings'
import {
  readActivityPhoto,
  downloadBackup,
  readBackup,
} from '@/modules/gift-registry-manager-ui/utils/files'
import { readDisplayLink } from '@/modules/gift-registry-manager-ui/utils/display-link'
import { i18n } from '@/shared/i18n'
import { saved } from '@/shared/utils/feedback'
import { locales } from '@/modules/gift-registry-manager-ui/locales'
import type {
  DisplaySettings,
  GiftEvent,
} from '@/modules/gift-registry-manager-ui/types'

i18n.global.mergeLocaleMessage('zh', { gift: locales.zh })
vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  giftApi: {
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    updateSettings: vi.fn(),
    backup: vi.fn(),
    restore: vi.fn(),
    issueDisplayToken: vi.fn(),
    rotateDisplayToken: vi.fn(),
  },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))
vi.mock(
  '@/modules/gift-registry-manager-ui/utils/files',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/modules/gift-registry-manager-ui/utils/files')
    >()),
    readActivityPhoto: vi.fn(),
    downloadBackup: vi.fn(),
  }),
)
const base: GiftEvent = {
  id: 'a',
  name: '活动A',
  eventDate: '2026-10-20',
  eventType: 'WEDDING',
  description: '',
  status: 'ACTIVE',
  version: 3,
  createdAt: 0,
  updatedAt: 0,
}
function setup() {
  const event = ref<GiftEvent>({ ...base })
  const settings = ref<DisplaySettings>({
    title: '自定标题',
    photoDataUrl: null,
    columnsPerPage: 12,
    version: 3,
  })
  const reload = vi.fn(async () => {})
  return {
    config: useEventSettings(event, settings, ref([]), reload),
    event,
    reload,
  }
}
beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  vi.mocked(giftApi.createEvent).mockResolvedValue(base)
  vi.mocked(giftApi.updateEvent).mockResolvedValue(base)
  vi.mocked(giftApi.updateSettings).mockResolvedValue({
    title: '已保存标题',
    photoDataUrl: null,
    columnsPerPage: 12,
    version: 4,
  })
  vi.mocked(giftApi.issueDisplayToken).mockResolvedValue({ token: 'issued' })
  vi.mocked(giftApi.rotateDisplayToken).mockResolvedValue({ token: 'rotated' })
})

describe('event types, drafts and reusable display credentials', () => {
  it('rejects blank or overlong display titles without saving or reporting success, and trims a valid 128-character title', async () => {
    const { config } = setup()
    config.openDisplay()
    for (const title of ['  ', '标'.repeat(129)]) {
      config.settingsDraft.title = title
      await config.saveDisplay()
      expect(config.displayOpen.value).toBe(true)
      expect(config.task.error.value).toBe(locales.zh.displayTitleRequired)
    }
    expect(giftApi.updateSettings).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    config.settingsDraft.title = `  ${'标'.repeat(128)}  `
    await config.saveDisplay()
    expect(giftApi.updateSettings).toHaveBeenCalledExactlyOnceWith(
      'a',
      expect.objectContaining({ title: '标'.repeat(128), expectedVersion: 3 }),
    )
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.savedSettings)
  })

  it('reports a committed settings save before a failed refresh and advances the version from its response', async () => {
    const { config, reload } = setup()
    config.openDisplay()
    reload.mockImplementationOnce(async () => {
      expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.savedSettings)
      throw new Error('Refresh failed')
    })
    await config.saveDisplay()
    expect(config.displayOpen.value).toBe(false)
    expect(config.task.error.value).toBe(locales.zh.refreshError)
    await config.saveDisplay()
    expect(giftApi.updateSettings).toHaveBeenNthCalledWith(
      2,
      'a',
      expect.objectContaining({ expectedVersion: 4 }),
    )
  })

  it('does not report a rejected settings write as successful', async () => {
    const { config, reload } = setup()
    config.openDisplay()
    vi.mocked(giftApi.updateSettings).mockRejectedValueOnce(
      new Error('Rejected'),
    )
    await config.saveDisplay()
    expect(config.task.error.value).toBe('Rejected')
    expect(config.displayOpen.value).toBe(true)
    expect(saved).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('only reports successful photo draft changes, and marks them as awaiting save', async () => {
    const { config } = setup()
    const file = {} as File
    vi.mocked(readActivityPhoto).mockRejectedValueOnce(
      new Error('Invalid photo'),
    )
    await config.photo(file)
    expect(saved).not.toHaveBeenCalled()
    expect(config.settingsDraft.photoDataUrl).toBeNull()
    vi.mocked(readActivityPhoto).mockResolvedValueOnce(
      'data:image/png;base64,valid',
    )
    await config.photo(file)
    expect(saved).toHaveBeenNthCalledWith(1, locales.zh.selectedPhoto)
    config.removePhoto()
    expect(config.settingsDraft.photoDataUrl).toBeNull()
    expect(saved).toHaveBeenNthCalledWith(2, locales.zh.removedPhoto)
    config.removePhoto()
    expect(saved).toHaveBeenCalledTimes(2)
    expect(giftApi.updateSettings).not.toHaveBeenCalled()
  })

  it('reports creation and restore as successful even if their following refresh fails', async () => {
    const { config, reload } = setup()
    reload.mockRejectedValue(new Error('Read failed'))
    config.openEvent(true)
    Object.assign(config.eventDraft, {
      name: '新活动',
      eventType: 'WEDDING',
      description: '亲友喜宴',
    })
    await config.saveEvent()
    expect(config.eventOpen.value).toBe(false)
    expect(saved).toHaveBeenLastCalledWith(locales.zh.createdEvent)
    expect(config.task.error.value).toBe(locales.zh.refreshError)
    vi.mocked(giftApi.restore).mockResolvedValueOnce({
      ...base,
      id: 'restored',
    })
    const file = {
      size: 50,
      text: async () =>
        JSON.stringify({
          schemaVersion: 2,
          event: {},
          settings: {},
          entries: [],
          audits: [],
        }),
    } as File
    await config.restore(file)
    expect(saved).toHaveBeenLastCalledWith(locales.zh.restored)
    expect(reload).toHaveBeenLastCalledWith('restored')
    expect(config.task.error.value).toBe(locales.zh.refreshError)
  })

  it('reports backup only after initiating its download and never on a failed file action', async () => {
    const { config } = setup()
    vi.mocked(giftApi.backup).mockRejectedValueOnce(
      new Error('Backup read failed'),
    )
    await config.backup()
    expect(downloadBackup).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    vi.mocked(giftApi.backup).mockResolvedValue({
      schemaVersion: 2,
      event: base,
      settings: {
        title: '标题',
        photoDataUrl: null,
        columnsPerPage: 12,
        version: 3,
      },
      entries: [],
      audits: [],
    })
    vi.mocked(downloadBackup).mockImplementationOnce(() => {
      throw new Error('Download failed')
    })
    await config.backup()
    expect(saved).not.toHaveBeenCalled()
    await config.backup()
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.downloadedBackup)
  })

  it('starts without a selected type, requires a trimmed description and previews an isolated draft', async () => {
    const { config, event } = setup()
    config.openEvent(true)
    expect(config.eventDraft.eventType).toBeNull()
    Object.assign(config.eventDraft, {
      name: ' 新活动 ',
      description: ' 描述 ',
    })
    await config.saveEvent()
    expect(giftApi.createEvent).not.toHaveBeenCalled()
    config.eventDraft.eventType = 'FUNERAL'
    config.eventDraft.description = '  '
    await config.saveEvent()
    expect(giftApi.createEvent).not.toHaveBeenCalled()
    config.eventDraft.description = ' 亲友追思\n敬致哀思 '
    expect(config.eventPreview.value.event).toMatchObject({
      eventType: 'FUNERAL',
      name: '新活动',
      description: '亲友追思\n敬致哀思',
    })
    expect(config.eventPreview.value.settings.title).toBe('新活动')
    expect(event.value).toEqual(base)
    expect(saved).not.toHaveBeenCalled()
    await config.saveEvent()
    expect(giftApi.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '新活动',
        eventType: 'FUNERAL',
        description: '亲友追思\n敬致哀思',
      }),
    )
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.createdEvent)
  })

  it('requires the missing legacy description before editing and sends the selected type with the event version', async () => {
    const { config } = setup()
    config.openEvent()
    expect(config.eventDraft.eventType).toBe('WEDDING')
    await config.saveEvent()
    expect(giftApi.updateEvent).not.toHaveBeenCalled()
    config.eventDraft.description = 'x'.repeat(1025)
    await config.saveEvent()
    expect(giftApi.updateEvent).not.toHaveBeenCalled()
    Object.assign(config.eventDraft, {
      eventType: 'BIRTHDAY',
      description: '  八十寿宴  ',
    })
    await config.saveEvent()
    expect(giftApi.updateEvent).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        eventType: 'BIRTHDAY',
        description: '八十寿宴',
        expectedVersion: 3,
      }),
    )
    expect(saved).toHaveBeenCalledExactlyOnceWith(locales.zh.updatedEvent)
  })

  it.each([
    'FULL_MOON',
    'HUNDRED_DAYS',
    'FIRST_BIRTHDAY',
    'ENGAGEMENT',
    'HOUSEWARMING',
    'GRADUATION',
    'BUSINESS_OPENING',
  ] as const)(
    'keeps %s through create, preview, edit and backup preflight',
    async (eventType) => {
      const { config, event } = setup()
      config.openEvent(true)
      Object.assign(config.eventDraft, {
        name: '新活动',
        description: '亲友相聚',
        eventType,
      })
      expect(config.eventPreview.value.event.eventType).toBe(eventType)
      await config.saveEvent()
      expect(giftApi.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType }),
      )
      event.value = { ...base, eventType, description: '亲友相聚' }
      config.openEvent()
      expect(config.eventDraft.eventType).toBe(eventType)
      await config.saveEvent()
      expect(giftApi.updateEvent).toHaveBeenCalledWith(
        'a',
        expect.objectContaining({ eventType }),
      )
      const payload = {
        schemaVersion: 2,
        event: event.value,
        settings: {},
        entries: [],
        audits: [],
      }
      const bundle = await readBackup({
        size: 100,
        text: async () => JSON.stringify(payload),
      } as File)
      expect(bundle.event.eventType).toBe(eventType)
    },
  )

  it('reuses the full link after reopening settings and recreating the hook without issuing or rotating again', async () => {
    const first = setup().config
    first.openDisplay()
    await first.generateDisplayLink('/gift-registry/display/a')
    const link = first.displayLink.value
    expect(new URL(link).hash).toBe('#token=issued')
    first.openDisplay()
    expect(first.displayLink.value).toBe(link)
    await first.generateDisplayLink('/gift-registry/display/a')
    const second = setup().config
    second.openDisplay()
    await second.generateDisplayLink('/gift-registry/display/a')
    expect(second.displayLink.value).toBe(link)
    expect(giftApi.issueDisplayToken).toHaveBeenCalledTimes(1)
    expect(giftApi.rotateDisplayToken).not.toHaveBeenCalled()
    expect(saved).toHaveBeenNthCalledWith(1, locales.zh.generatedLink)
    expect(saved).toHaveBeenNthCalledWith(2, locales.zh.reusedLink)
    expect(saved).toHaveBeenNthCalledWith(3, locales.zh.reusedLink)
  })

  it('issues a new credential after cache loss without rotating, and keeps links isolated by event', async () => {
    const first = setup().config
    await first.generateDisplayLink('/gift-registry/display/a')
    localStorage.clear()
    const { config, event } = setup()
    await config.generateDisplayLink('/gift-registry/display/a')
    event.value = { ...base, id: 'b' }
    config.openDisplay()
    expect(config.displayLink.value).toBe('')
    await config.generateDisplayLink('/gift-registry/display/b')
    expect(giftApi.issueDisplayToken).toHaveBeenNthCalledWith(3, 'b')
    expect(giftApi.rotateDisplayToken).not.toHaveBeenCalled()
    localStorage.setItem(
      'gift-registry:display-link:a',
      'https://other.invalid/gift-registry/display/a#token=bad',
    )
    expect(readDisplayLink('a')).toBe('')
  })

  it('only replaces a cached link after an explicit successful reset', async () => {
    const { config } = setup()
    await config.generateDisplayLink('/gift-registry/display/a')
    const old = config.displayLink.value
    vi.mocked(giftApi.rotateDisplayToken).mockRejectedValueOnce(
      new Error('Reset failed'),
    )
    await config.generateDisplayLink('/gift-registry/display/a', true)
    expect(config.displayLink.value).toBe(old)
    expect(readDisplayLink('a')).toBe(old)
    expect(saved).toHaveBeenCalledTimes(1)
    await config.generateDisplayLink('/gift-registry/display/a', true)
    expect(new URL(config.displayLink.value).hash).toBe('#token=rotated')
    expect(readDisplayLink('a')).toBe(config.displayLink.value)
    expect(giftApi.issueDisplayToken).toHaveBeenCalledTimes(1)
    expect(saved).toHaveBeenLastCalledWith(locales.zh.resetLink)
  })

  it('can explicitly reset after issuing hits the concurrent-link limit with no cached link', async () => {
    const { config } = setup()
    vi.mocked(giftApi.issueDisplayToken).mockRejectedValueOnce(
      new Error('Link limit reached'),
    )
    await config.generateDisplayLink('/gift-registry/display/a')
    expect(config.displayLink.value).toBe('')
    expect(config.task.error.value).toBe('Link limit reached')
    expect(saved).not.toHaveBeenCalled()
    await config.generateDisplayLink('/gift-registry/display/a', true)
    expect(new URL(config.displayLink.value).hash).toBe('#token=rotated')
    expect(giftApi.rotateDisplayToken).toHaveBeenCalledWith('a')
  })
})

it('accepts both legacy v1 and current v2 backup files without inventing missing event details', async () => {
  for (const schemaVersion of [1, 2]) {
    const payload = {
      schemaVersion,
      event: { name: '旧活动' },
      settings: {},
      entries: [],
      audits: [],
    }
    const file = {
      size: 50,
      text: async () => JSON.stringify(payload),
    } as File
    const bundle = await readBackup(file)
    expect(bundle.schemaVersion).toBe(schemaVersion)
    expect(bundle.event).not.toHaveProperty('eventType')
  }
  const unsupported = {
    size: 50,
    text: async () => JSON.stringify({ schemaVersion: 3 }),
  } as File
  await expect(readBackup(unsupported)).rejects.toThrow(
    locales.zh.restoreInvalid,
  )
})
