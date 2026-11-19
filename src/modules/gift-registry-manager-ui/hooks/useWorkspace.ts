import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import { giftApi } from '../api'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { download } from '@/shared/api/client'
import { saved } from '@/shared/utils/feedback'
import { useTask } from '@/shared/composables/useTask'
import { cloneQueryTerms } from '@/shared/utils/query-model'
import type { Query } from '@/shared/api/types'
import type {
  DisplaySettings,
  GiftEntry,
  GiftEvent,
  GiftSummary,
} from '../types'

/** Owns event selection, authoritative totals, and list pagination without sharing data across events. */
export function useWorkspace(preferredEventId?: string) {
  const events = shallowRef<GiftEvent[]>([])
  const eventId = ref('')
  const event = shallowRef<GiftEvent>()
  const settings = shallowRef<DisplaySettings>()
  const summary = shallowRef<GiftSummary>()
  const entries = shallowRef<GiftEntry[]>([])
  const loading = ref(false)
  const eventLoading = ref(false)
  const error = ref('')
  const listError = ref('')
  const exportTask = useTask()
  let appliedTerms: Query['terms'] = []
  let queryTerms: Query['terms'] = []
  const pagination = reactive({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
  })
  let generation = 0
  let controller: AbortController | undefined
  let listController: AbortController | undefined
  let listGeneration = 0
  const selectedActive = computed(() => event.value?.status === 'ACTIVE')

  /** Shared query terms retain their grouping; UI pagination always owns the transport page. */
  function query(): Query {
    return {
      terms: cloneQueryTerms(queryTerms || []),
      pageIndex: pagination.current - 1,
      pageSize: pagination.pageSize,
      sorts: [{ name: 'seq', order: 'desc' }],
    }
  }

  /** Latest search wins even when a previous request completes after the next page was selected. */
  async function loadEntries() {
    const id = eventId.value
    if (!id) return
    listController?.abort()
    listController = new AbortController()
    const epoch = ++listGeneration
    loading.value = true
    listError.value = ''
    try {
      const parameters = query()
      const result = await giftApi.entries(id, parameters, {
        signal: listController.signal,
        silent: true,
      })
      if (epoch !== listGeneration || id !== eventId.value) return
      entries.value = result.data
      appliedTerms = parameters.terms
      pagination.total = result.total
    } catch (cause) {
      if (
        epoch === listGeneration &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        listError.value =
          cause instanceof Error ? cause.message : t('gift.requestFailed')
    } finally {
      if (epoch === listGeneration) loading.value = false
    }
  }

  /** Switching scope clears previous data immediately and aborts its outstanding requests. */
  async function select(id: string) {
    controller?.abort()
    listController?.abort()
    generation++
    listGeneration++
    eventId.value = id
    event.value = undefined
    settings.value = undefined
    summary.value = undefined
    entries.value = []
    queryTerms = []
    appliedTerms = []
    pagination.current = 1
    pagination.total = 0
    await refresh()
  }

  /** Totals always come from all valid entries, independent of the current list filters. */
  async function refresh() {
    const id = eventId.value
    if (!id) return
    controller?.abort()
    controller = new AbortController()
    const epoch = ++generation
    eventLoading.value = true
    error.value = ''
    try {
      const options = { signal: controller.signal, silent: true }
      const [current, display, totals] = await Promise.all([
        giftApi.event(id, options),
        giftApi.settings(id, options),
        giftApi.summary(id, options),
      ])
      if (id !== eventId.value || epoch !== generation) return
      event.value = current
      settings.value = display
      summary.value = totals
      events.value = events.value.map((item) =>
        item.id === id ? current : item,
      )
      await loadEntries()
    } catch (cause) {
      if (
        epoch === generation &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value =
          cause instanceof Error ? cause.message : t('gift.requestFailed')
    } finally {
      if (epoch === generation) eventLoading.value = false
    }
  }

  /** Reload event choices after creation/restoration and preserve the explicitly selected activity. */
  async function loadEvents(preferredId?: string) {
    eventLoading.value = true
    error.value = ''
    try {
      // The backend requires bounded paging; collect event choices within its query limits.
      const choices: GiftEvent[] = []
      let pageIndex = 0
      let total = 0
      do {
        const result = await giftApi.events({
          paging: true,
          pageIndex,
          pageSize: 200,
          sorts: [{ name: 'createdAt', order: 'desc' }],
        })
        choices.push(...result.data)
        total = result.total
        pageIndex++
        if (!result.data.length) break
      } while (choices.length < total)
      events.value = choices
      const candidate = preferredId || eventId.value
      const id = choices.some((item) => item.id === candidate)
        ? candidate
        : choices[0]?.id || ''
      await select(id)
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : t('gift.requestFailed')
    } finally {
      eventLoading.value = false
    }
  }

  async function search(criteria: Query) {
    queryTerms = cloneQueryTerms(criteria.terms || [])
    pagination.current = 1
    await loadEntries()
  }
  async function page(current: number, size: number) {
    pagination.current = size === pagination.pageSize ? current : 1
    pagination.pageSize = size
    await loadEntries()
  }
  /** Export the last successful list filter, never an unsubmitted draft or just the visible page. */
  async function exportEntries() {
    const id = eventId.value
    if (!id || loading.value || eventLoading.value) return
    await exportTask.run(async () => {
      await download(
        await giftApi.exportEntries(id, { paging: false, terms: appliedTerms }),
      )
      void saved(t('gift.exportedEntries'))
    })
  }
  onMounted(() => void loadEvents(preferredEventId))
  onBeforeUnmount(() => {
    generation++
    listGeneration++
    controller?.abort()
    listController?.abort()
  })
  return {
    events,
    eventId,
    event,
    settings,
    summary,
    entries,
    loading,
    eventLoading,
    error,
    listError,
    pagination,
    selectedActive,
    select,
    refresh,
    loadEvents,
    loadEntries,
    search,
    page,
    exportTask,
    exportEntries,
  }
}
