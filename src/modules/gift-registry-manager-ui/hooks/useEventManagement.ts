import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import { giftApi } from '../api'
import { usePermissions } from '@/shared/auth/provider'
import { useTask } from '@/shared/composables/useTask'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { cloneQueryTerms } from '@/shared/utils/query-model'
import { t } from '@/shared/i18n'
import type { Query } from '@/shared/api/types'
import { removeDisplayLink } from '../utils/display-link'
import type { GiftEvent } from '../types'

/** Owns the paged activity lifecycle list; confirmation is rendered by the management page. */
export function useEventManagement() {
  const permissions = usePermissions()
  const canSave = computed(() => permissions.can('gift-registry:save'))
  const canDelete = computed(() => permissions.can('gift-registry:delete'))
  const rows = shallowRef<GiftEvent[]>([])
  const loading = ref(false)
  const error = ref('')
  const task = useTask()
  let queryTerms: NonNullable<Query['terms']> = []
  const pagination = reactive({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
  })
  let generation = 0
  let controller: AbortController | undefined

  async function load() {
    controller?.abort()
    controller = new AbortController()
    const epoch = ++generation
    loading.value = true
    error.value = ''
    try {
      const result = await giftApi.events(
        {
          paging: true,
          pageIndex: pagination.current - 1,
          pageSize: pagination.pageSize,
          terms: cloneQueryTerms(queryTerms),
          sorts: [{ name: 'createdAt', order: 'desc' }],
        },
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation) return
      rows.value = result.data
      pagination.total = result.total
    } catch (cause) {
      if (
        epoch === generation &&
        !(cause instanceof ApiError && cause.cancelled)
      )
        error.value =
          cause instanceof Error ? cause.message : t('gift.requestFailed')
    } finally {
      if (epoch === generation) loading.value = false
    }
  }

  /** Accept the shared query model without retaining references to the editor's draft. */
  async function search(criteria: Query) {
    queryTerms = cloneQueryTerms(criteria.terms || [])
    pagination.current = 1
    await load()
  }
  async function page(current: number, pageSize: number) {
    pagination.current = pageSize === pagination.pageSize ? current : 1
    pagination.pageSize = pageSize
    await load()
  }

  /** Preserve required business details and use the visible version for the confirmed state change. */
  async function changeStatus(event: GiftEvent) {
    if (!canSave.value || !event.description.trim()) return
    await task.run(async () => {
      const updated = await giftApi.updateEvent(event.id, {
        name: event.name,
        eventDate: event.eventDate,
        eventType: event.eventType,
        description: event.description,
        status: event.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE',
        expectedVersion: event.version,
      })
      rows.value = rows.value.map((item) =>
        item.id === updated.id ? updated : item,
      )
      void saved(
        t(
          updated.status === 'CLOSED'
            ? 'gift.closedEvent'
            : 'gift.reopenedEvent',
        ),
      )
      await load()
    })
  }

  /** Only a confirmed CLOSED deletion clears local credentials; a conflict leaves them intact. */
  async function remove(event: GiftEvent) {
    if (!canDelete.value || event.status !== 'CLOSED') return
    await task.run(async () => {
      if (!(await giftApi.deleteEvent(event.id, event.version)))
        throw new Error(t('gift.requestFailed'))
      removeDisplayLink(event.id)
      rows.value = rows.value.filter((item) => item.id !== event.id)
      pagination.total = Math.max(0, pagination.total - 1)
      if (!rows.value.length && pagination.current > 1) pagination.current--
      void saved(t('gift.deletedEvent'))
      await load()
    })
  }

  onMounted(() => void load())
  onBeforeUnmount(() => {
    generation++
    controller?.abort()
  })
  return {
    rows,
    loading,
    error,
    task,
    pagination,
    canSave,
    canDelete,
    load,
    search,
    page,
    changeStatus,
    remove,
  }
}
