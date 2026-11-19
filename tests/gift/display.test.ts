import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { displayApi } from '@/modules/gift-registry-manager-ui/api'
import { useDisplay } from '@/modules/gift-registry-manager-ui/hooks/useDisplay'
import { ApiError } from '@/shared/api/errors'
import type { DisplaySnapshot } from '@/modules/gift-registry-manager-ui/types'

vi.mock('@/modules/gift-registry-manager-ui/api', () => ({
  displayApi: { version: vi.fn(), snapshot: vi.fn() },
}))
const base: DisplaySnapshot = {
  latestEntrySeq: 1,
  event: {
    id: 'a',
    name: '活动A',
    eventDate: '2026-10-19',
    eventType: 'WEDDING',
    description: '',
  },
  settings: { title: '活动A', photoDataUrl: null, columnsPerPage: 12 },
  version: 1,
  entries: [{ id: 'e1', seq: 1, name: '张三', amountCents: 123 }],
  total: 1,
  pageIndex: 0,
  pageSize: 12,
}
const webSocket = vi.fn()
const wrappers: ReturnType<typeof mount>[] = []
function setup(initialToken = 'token-a') {
  const id = ref('a'),
    token = ref(initialToken),
    size = ref(12)
  let display!: ReturnType<typeof useDisplay>
  const wrapper = mount(
    defineComponent({
      setup() {
        display = useDisplay(id, token, size)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { display, id, token, size, wrapper }
}
async function poll() {
  await vi.advanceTimersByTimeAsync(2000)
  await flushPromises()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.stubGlobal('WebSocket', webSocket)
  vi.mocked(displayApi.version).mockResolvedValue({ version: 1 })
  vi.mocked(displayApi.snapshot).mockResolvedValue(base)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  expect(webSocket).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('independent display HTTP polling', () => {
  it('opens the tail directly and checks the version every two seconds without reloading unchanged pages', async () => {
    const { display } = setup()
    await flushPromises()
    expect(displayApi.snapshot).toHaveBeenCalledExactlyOnceWith(
      'a',
      'token-a',
      -1,
      expect.any(AbortSignal),
      12,
    )
    expect(display.disconnected.value).toBe(false)
    await vi.advanceTimersByTimeAsync(1999)
    expect(displayApi.version).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(displayApi.version).toHaveBeenCalledExactlyOnceWith(
      'a',
      'token-a',
      expect.any(AbortSignal),
    )
    await poll()
    expect(displayApi.version).toHaveBeenCalledTimes(2)
    expect(displayApi.snapshot).toHaveBeenCalledTimes(1)
  })

  it('reloads changed versions and uses the final snapshot version when a save races the probe', async () => {
    const { display } = setup()
    await flushPromises()
    vi.mocked(displayApi.version).mockResolvedValueOnce({ version: 2 })
    vi.mocked(displayApi.snapshot).mockResolvedValueOnce({
      ...base,
      version: 3,
    })
    await poll()
    expect(display.snapshot.value?.version).toBe(3)
    vi.mocked(displayApi.version).mockResolvedValue({ version: 3 })
    await poll()
    expect(displayApi.snapshot).toHaveBeenCalledTimes(2)
  })

  it('retains the last picture offline and reloads the same version on recovery', async () => {
    const { display } = setup()
    await flushPromises()
    vi.mocked(displayApi.version).mockRejectedValueOnce(new Error('Offline'))
    await poll()
    expect(display.disconnected.value).toBe(true)
    expect(display.snapshot.value?.entries[0]?.name).toBe('张三')
    expect(display.error.value).toBe('Offline')
    await poll()
    expect(displayApi.snapshot).toHaveBeenCalledTimes(2)
    expect(display.disconnected.value).toBe(false)
    expect(display.error.value).toBe('')
  })

  it('retries a failed initial snapshot through the version probe', async () => {
    vi.mocked(displayApi.snapshot).mockRejectedValueOnce(new Error('Offline'))
    const { display } = setup()
    await flushPromises()
    expect(display.snapshot.value).toBeUndefined()
    expect(display.disconnected.value).toBe(true)
    await poll()
    expect(displayApi.version).toHaveBeenCalledOnce()
    expect(display.snapshot.value).toEqual(base)
    expect(display.disconnected.value).toBe(false)
  })

  it('schedules the next probe after the entire slow probe and snapshot have finished', async () => {
    let resolveVersion!: (value: { version: number }) => void
    let resolveSnapshot!: (value: DisplaySnapshot) => void
    const { display } = setup()
    await flushPromises()
    vi.mocked(displayApi.version).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVersion = resolve
        }),
    )
    vi.mocked(displayApi.snapshot).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve
        }),
    )
    await poll()
    await vi.advanceTimersByTimeAsync(10000)
    expect(displayApi.version).toHaveBeenCalledTimes(1)
    resolveVersion({ version: 2 })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(10000)
    expect(displayApi.version).toHaveBeenCalledTimes(1)
    expect(displayApi.snapshot).toHaveBeenCalledTimes(2)
    resolveSnapshot({ ...base, version: 2 })
    await flushPromises()
    expect(display.snapshot.value?.version).toBe(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(displayApi.version).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(displayApi.version).toHaveBeenCalledTimes(2)
  })

  it('follows new sequence rows even at the same total, while edits and manual pages stay put', async () => {
    let sequence = 24,
      version = 1
    vi.mocked(displayApi.version).mockImplementation(async () => ({ version }))
    vi.mocked(displayApi.snapshot).mockImplementation(
      async (_id, _token, page) => ({
        ...base,
        total: 24,
        pageSize: 12,
        latestEntrySeq: sequence,
        version,
        pageIndex: page === -1 ? 1 : page,
      }),
    )
    const { display } = setup()
    await flushPromises()
    expect(display.snapshot.value?.pageIndex).toBe(1)
    await display.sync(true, 0)
    expect(display.snapshot.value?.pageIndex).toBe(0)
    sequence = 25
    version++
    await poll()
    expect(display.snapshot.value?.pageIndex).toBe(1)
    await display.sync(true, 0)
    version++
    await poll()
    expect(display.snapshot.value?.pageIndex).toBe(0)
  })

  it('asks the server for the current tail when a registration races the second snapshot', async () => {
    const { display } = setup()
    await flushPromises()
    vi.mocked(displayApi.version).mockResolvedValueOnce({ version: 2 })
    vi.mocked(displayApi.snapshot)
      .mockResolvedValueOnce({
        ...base,
        pageSize: 1,
        pageIndex: 0,
        total: 2,
        latestEntrySeq: 2,
        version: 2,
      })
      .mockImplementationOnce(async (_id, _token, page) => ({
        ...base,
        pageSize: 1,
        pageIndex: page === -1 ? 2 : page,
        total: 3,
        latestEntrySeq: 3,
        version: 3,
      }))
    await poll()
    expect(vi.mocked(displayApi.snapshot).mock.calls.at(-1)?.[2]).toBe(-1)
    expect(display.snapshot.value?.pageIndex).toBe(2)
    expect(display.snapshot.value?.latestEntrySeq).toBe(3)
  })

  it('reflows page sizes around the current first record without dropping canonical data', async () => {
    vi.mocked(displayApi.snapshot).mockImplementation(
      async (_id, _token, page, _signal, size) => ({
        ...base,
        total: 24,
        latestEntrySeq: 24,
        pageSize: size!,
        pageIndex: page === -1 ? Math.ceil(24 / size!) - 1 : page,
      }),
    )
    const { display, size } = setup()
    await flushPromises()
    expect(display.snapshot.value?.pageIndex).toBe(1)
    size.value = 2
    await nextTick()
    await flushPromises()
    expect(display.snapshot.value?.pageIndex).toBe(6)
    expect(display.snapshot.value?.pageSize).toBe(2)
  })

  for (const endpoint of ['version', 'snapshot'] as const) {
    it.each([403, 404])(
      `clears retained data and stops polling after ${endpoint} returns %s`,
      async (status) => {
        const { display } = setup()
        await flushPromises()
        if (endpoint === 'snapshot')
          vi.mocked(displayApi.version).mockResolvedValueOnce({ version: 2 })
        vi.mocked(displayApi[endpoint]).mockRejectedValueOnce(
          new ApiError('Access denied', status),
        )
        await poll()
        expect(display.snapshot.value).toBeUndefined()
        expect(display.error.value).toBe('Access denied')
        const probes = vi.mocked(displayApi.version).mock.calls.length
        const pictures = vi.mocked(displayApi.snapshot).mock.calls.length
        await vi.advanceTimersByTimeAsync(60000)
        await display.sync()
        expect(displayApi.version).toHaveBeenCalledTimes(probes)
        expect(displayApi.snapshot).toHaveBeenCalledTimes(pictures)
      },
    )
  }

  it('sends no requests without a token and starts a fresh scope when credentials arrive or change', async () => {
    const { display, token } = setup('')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(10000)
    expect(displayApi.version).not.toHaveBeenCalled()
    expect(displayApi.snapshot).not.toHaveBeenCalled()
    token.value = 'token-a'
    await nextTick()
    await flushPromises()
    expect(display.snapshot.value).toEqual(base)
    vi.mocked(displayApi.version).mockRejectedValueOnce(
      new ApiError('Access denied', 403),
    )
    await poll()
    expect(display.snapshot.value).toBeUndefined()
    token.value = 'token-new'
    await nextTick()
    await flushPromises()
    expect(vi.mocked(displayApi.snapshot).mock.calls.at(-1)?.[1]).toBe(
      'token-new',
    )
    expect(display.snapshot.value).toEqual(base)
  })

  it('discards stale snapshots after a scope change and cancels pending timers on unmount', async () => {
    let resolveOld!: (snapshot: DisplaySnapshot) => void
    vi.mocked(displayApi.snapshot).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    const { display, id, token, wrapper } = setup()
    const oldSignal = vi.mocked(displayApi.snapshot).mock.calls[0]![3]!
    id.value = 'b'
    token.value = 'token-b'
    await nextTick()
    await flushPromises()
    expect(oldSignal.aborted).toBe(true)
    resolveOld({ ...base, event: { ...base.event, id: 'old' } })
    await flushPromises()
    expect(display.snapshot.value?.event.id).not.toBe('old')
    const calls = vi.mocked(displayApi.snapshot).mock.calls.length
    wrapper.unmount()
    wrappers.length = 0
    await vi.advanceTimersByTimeAsync(60000)
    expect(displayApi.version).not.toHaveBeenCalled()
    expect(displayApi.snapshot).toHaveBeenCalledTimes(calls)
    expect(vi.mocked(displayApi.snapshot).mock.calls.at(-1)?.[3]?.aborted).toBe(
      true,
    )
  })

  it('aborts an in-flight version probe on unmount and ignores its late result', async () => {
    let resolveVersion!: (value: { version: number }) => void
    const { wrapper } = setup()
    await flushPromises()
    vi.mocked(displayApi.version).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVersion = resolve
        }),
    )
    await poll()
    const signal = vi.mocked(displayApi.version).mock.calls[0]![2]!
    wrapper.unmount()
    wrappers.length = 0
    expect(signal.aborted).toBe(true)
    resolveVersion({ version: 2 })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60000)
    expect(displayApi.snapshot).toHaveBeenCalledTimes(1)
    expect(displayApi.version).toHaveBeenCalledTimes(1)
  })
})
