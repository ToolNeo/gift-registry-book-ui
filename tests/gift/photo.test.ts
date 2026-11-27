import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readActivityPhoto } from '@/modules/gift-registry-manager-ui/utils/files'
import { resolveActivityPhotoUrl } from '@/modules/gift-registry-manager-ui/utils/photos'
import { giftApi } from '@/modules/gift-registry-manager-ui/api'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { locales } from '@/modules/gift-registry-manager-ui/locales'

i18n.global.mergeLocaleMessage('zh', { gift: locales.zh })

vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: {} }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:local-photo')
      static revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('activity photo files and URLs', () => {
  it('commits a binary file and a JSON settings part without embedding either image URL or base64', async () => {
    const file = new File(['png-bytes'], 'photo.png', { type: 'image/png' })
    const input = { title: '喜宴', columnsPerPage: 12, expectedVersion: 3 }
    const result = {
      ...input,
      photoUrl: '/api/file/static/20261127/new.png',
      version: 4,
    }
    vi.mocked(request.post).mockResolvedValueOnce({
      result,
      success: true,
      status: 200,
    })
    expect(await giftApi.updateSettingsPhoto('event/a', file, input)).toEqual(
      result,
    )
    const [path, body] = vi.mocked(request.post).mock.calls[0]!
    expect(path).toBe('/gift-registry/events/event%2Fa/display-settings/photo')
    expect(body).toBeInstanceOf(FormData)
    const parts = body as FormData
    expect(Array.from(parts.keys())).toEqual(['file', 'settings'])
    expect(parts.get('file')).toBe(file)
    const settings = parts.get('settings') as Blob
    expect(settings.type).toBe('application/json')
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(settings)
    })
    expect(JSON.parse(text)).toEqual(input)
    expect(text).not.toMatch(/base64|blob:|photoUrl|photoDataUrl/)
  })

  it('resolves persisted photo paths through the configured API mount including a separate origin', () => {
    const path = '/api/file/static/20261127/photo.png'
    expect(resolveActivityPhotoUrl(path, '/api')).toBe(path)
    expect(resolveActivityPhotoUrl(path, '/backend/')).toBe(
      '/backend/file/static/20261127/photo.png',
    )
    expect(
      resolveActivityPhotoUrl(path, 'https://api.example.test/backend'),
    ).toBe('https://api.example.test/backend/file/static/20261127/photo.png')
    expect(
      resolveActivityPhotoUrl('https://cdn.example.test/photo.png', '/api'),
    ).toBe('https://cdn.example.test/photo.png')
    expect(resolveActivityPhotoUrl('blob:local-photo')).toBe('blob:local-photo')
    expect(resolveActivityPhotoUrl(null)).toBe('')
    expect(resolveActivityPhotoUrl('data:image/png;base64,image')).toBe('')
    expect(resolveActivityPhotoUrl('//other.test/photo.png')).toBe('')
  })

  it('decodes a local object URL and leaves cleanup of an accepted preview to its owner', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 10
        naturalHeight = 10
        onload: (() => void) | undefined
        set src(_value: string) {
          queueMicrotask(() => this.onload?.())
        }
      },
    )
    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    expect(await readActivityPhoto(file)).toBe('blob:local-photo')
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('releases an object URL when decoding rejects a malformed image', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onerror: (() => void) | undefined
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.())
        }
      },
    )
    await expect(
      readActivityPhoto(
        new File(['invalid'], 'photo.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo')
  })

  it.each([
    new File(['svg'], 'photo.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    }),
  ])('rejects an invalid file before allocating a preview', async (file) => {
    await expect(readActivityPhoto(file)).rejects.toThrow()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
