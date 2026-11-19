import {
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
  type Ref,
} from 'vue'
import { giftApi } from '../api'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { saved } from '@/shared/utils/feedback'
import { formatAmount, parseAmountCents } from '../utils/money'
import type { EntryDraft, EntryInput, GiftEntry } from '../types'

const emptyDraft = (): EntryDraft => ({
  name: '',
  amount: '',
  paymentMethod: 'CASH',
  attendeeCount: null,
  remark: '',
  reason: '',
})

/** Owns duplicate warnings and the retry identity of one registration, scoped to the selected event. */
export function useEntryEditor(
  eventId: Ref<string>,
  afterSave: () => Promise<void>,
) {
  const draft = reactive<EntryDraft>(emptyDraft())
  const editing = shallowRef<GiftEntry>()
  const duplicates = shallowRef<GiftEntry[]>([])
  const saving = ref(false)
  const error = ref('')
  const confirmDuplicates = ref(false)
  const uncertain = ref(false)
  let duplicateController: AbortController | undefined
  let duplicateTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let pending:
    | { eventId: string; requestId: string; input: EntryInput }
    | undefined

  /** Clear scope-specific warnings; cancellation prevents a slow previous activity lookup from leaking. */
  function cancelLookup() {
    duplicateController?.abort()
    clearTimeout(duplicateTimer)
    generation++
  }

  /** A reset happens only after confirmed success or an explicit activity/editor change. */
  function reset(entry?: GiftEntry) {
    cancelLookup()
    editing.value = entry
    Object.assign(
      draft,
      entry
        ? {
            name: entry.name,
            amount: formatAmount(entry.amountCents),
            paymentMethod: entry.paymentMethod,
            attendeeCount: entry.attendeeCount,
            remark: entry.remark,
            reason: '',
          }
        : emptyDraft(),
    )
    duplicates.value = []
    confirmDuplicates.value = false
    uncertain.value = false
    pending = undefined
    error.value = ''
  }

  /** The exact-name lookup includes voided records and explicitly excludes the row being edited. */
  async function lookup(): Promise<GiftEntry[] | undefined> {
    cancelLookup()
    const epoch = generation
    const id = eventId.value
    if (!id || !draft.name.trim()) {
      duplicates.value = []
      return []
    }
    duplicateController = new AbortController()
    const result = await giftApi.duplicates(id, draft.name, editing.value?.id, {
      signal: duplicateController.signal,
      silent: true,
    })
    if (epoch === generation && id === eventId.value) duplicates.value = result
    return epoch === generation ? result : undefined
  }

  watch(
    () => [eventId.value, draft.name, editing.value?.id],
    () => {
      cancelLookup()
      duplicates.value = []
      confirmDuplicates.value = false
      if (draft.name.trim() && eventId.value) {
        duplicateTimer = setTimeout(() => {
          void lookup().catch((cause: unknown) => {
            if (!(cause instanceof ApiError && cause.cancelled))
              error.value =
                cause instanceof Error ? cause.message : t('gift.requestFailed')
          })
        }, 350)
      }
    },
  )
  watch(eventId, () => reset())

  /** Reuse the same immutable payload and request ID after an uncertain create outcome. */
  async function submit(confirmed = false): Promise<boolean> {
    if (saving.value || !eventId.value) return false
    const amountCents = parseAmountCents(draft.amount)
    error.value = ''
    if (!draft.name.trim()) error.value = t('gift.nameRequired')
    else if (amountCents === undefined) error.value = t('gift.amountInvalid')
    else if (
      draft.attendeeCount !== null &&
      (!Number.isInteger(draft.attendeeCount) || draft.attendeeCount < 0)
    )
      error.value = t('gift.countInvalid')
    else if (editing.value && !draft.reason.trim())
      error.value = t('gift.reasonRequired')
    if (error.value || amountCents === undefined) return false
    saving.value = true
    const id = eventId.value
    let createStarted = false
    try {
      // Flush the name watcher before the authoritative check so it cannot invalidate this lookup.
      await nextTick()
      if (!uncertain.value) {
        const matches = await lookup()
        if (id !== eventId.value || matches === undefined) return false
        if (matches.length && !confirmed) {
          confirmDuplicates.value = true
          return false
        }
      }
      const input: EntryInput = {
        name: draft.name.trim(),
        amountCents,
        paymentMethod: draft.paymentMethod,
        attendeeCount: draft.attendeeCount,
        remark: draft.remark,
      }
      const corrected = !!editing.value
      if (editing.value) {
        await giftApi.updateEntry(id, editing.value.id, {
          ...input,
          expectedVersion: editing.value.version,
          reason: draft.reason.trim(),
        })
      } else {
        pending ||= { eventId: id, requestId: crypto.randomUUID(), input }
        createStarted = true
        await giftApi.createEntry(pending.eventId, {
          ...pending.input,
          requestId: pending.requestId,
        })
      }
      void saved(t(corrected ? 'gift.correctedEntry' : 'gift.savedEntry'))
      if (id !== eventId.value) return false
      reset()
      // A confirmed write stays successful even when the following read fails.
      try {
        await afterSave()
      } catch {
        error.value = t('gift.refreshError')
      }
      return true
    } catch (cause) {
      if (id === eventId.value) {
        uncertain.value =
          createStarted &&
          (!(cause instanceof ApiError) ||
            cause.status === 0 ||
            cause.status >= 500)
        if (!uncertain.value) pending = undefined
        error.value =
          cause instanceof Error ? cause.message : t('gift.requestFailed')
      }
      return false
    } finally {
      saving.value = false
    }
  }

  onBeforeUnmount(cancelLookup)
  return {
    draft,
    editing,
    duplicates,
    saving,
    error,
    confirmDuplicates,
    uncertain,
    reset,
    submit,
  }
}
