import { computed, reactive, ref, type Ref } from 'vue'
import { giftApi } from '../api'
import { useTask } from '@/shared/composables/useTask'
import { t } from '@/shared/i18n'
import { saved as notifySaved } from '@/shared/utils/feedback'
import { readActivityPhoto, downloadBackup, readBackup } from '../utils/files'
import { cacheDisplayLink, readDisplayLink } from '../utils/display-link'
import type {
  DisplaySettings,
  DisplaySnapshot,
  GiftEvent,
  GiftEntry,
  EventType,
} from '../types'

/** Isolate configuration drafts and file handling from the registration workspace. */
export function useEventSettings(
  event: Ref<GiftEvent | undefined>,
  settings: Ref<DisplaySettings | undefined>,
  entries: Ref<GiftEntry[]>,
  reload: (id?: string) => Promise<void>,
) {
  const task = useTask()
  const eventOpen = ref(false)
  const displayOpen = ref(false)
  const creating = ref(false)
  const previewOpen = ref(false)
  const displayLink = ref('')
  const previewSource = ref<'event' | 'display'>('display')
  const issuedLinks = new Map<string, string>()
  const eventDraft = reactive({
    name: '',
    eventDate: '',
    eventType: null as EventType | null,
    description: '',
    status: 'ACTIVE' as GiftEvent['status'],
  })
  const settingsDraft = reactive({
    title: '',
    photoDataUrl: null as string | null,
    columnsPerPage: 12,
  })
  let expectedVersion = 0
  const displayPreview = computed<DisplaySnapshot>(() => ({
    event: {
      id: event.value?.id || '',
      name: event.value?.name || '',
      eventDate: event.value?.eventDate || '',
      eventType: event.value?.eventType || 'WEDDING',
      description: event.value?.description || '',
    },
    settings: { ...settingsDraft },
    version: 0,
    latestEntrySeq: Math.max(0, ...entries.value.map((entry) => entry.seq)),
    entries: entries.value
      .filter((entry) => entry.status === 'VALID')
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .slice(0, settingsDraft.columnsPerPage)
      .map(({ id, seq, name, amountCents }) => ({
        id,
        seq,
        name,
        amountCents,
      })),
    total: entries.value.filter((entry) => entry.status === 'VALID').length,
    pageIndex: 0,
    pageSize: settingsDraft.columnsPerPage,
  }))
  const eventPreview = computed<DisplaySnapshot>(() => ({
    event: {
      id: event.value?.id || '',
      name: eventDraft.name.trim(),
      eventDate: eventDraft.eventDate,
      eventType: eventDraft.eventType || 'WEDDING',
      description: eventDraft.description.trim(),
    },
    settings: {
      title: creating.value
        ? eventDraft.name.trim()
        : settings.value?.title || '',
      photoDataUrl: creating.value
        ? null
        : settings.value?.photoDataUrl || null,
      columnsPerPage: 6,
    },
    version: 0,
    latestEntrySeq: 0,
    entries: [],
    total: 0,
    pageIndex: 0,
    pageSize: 6,
  }))
  const preview = computed(() =>
    previewSource.value === 'event' ? eventPreview.value : displayPreview.value,
  )
  function openPreview(source: 'event' | 'display') {
    previewSource.value = source
    previewOpen.value = true
  }

  /** Copy persisted values into a local draft; cancelling never changes the active event. */
  function openEvent(create = false) {
    creating.value = create
    Object.assign(
      eventDraft,
      create
        ? {
            name: '',
            eventDate: new Date().toLocaleDateString('en-CA'),
            eventType: null,
            description: '',
            status: 'ACTIVE',
          }
        : {
            name: event.value?.name || '',
            eventDate: event.value?.eventDate || '',
            eventType: event.value?.eventType || 'WEDDING',
            description: event.value?.description || '',
            status: event.value?.status || 'ACTIVE',
          },
    )
    expectedVersion = event.value?.version || 0
    task.error.value = ''
    eventOpen.value = true
  }

  async function saveEvent() {
    await task.run(async () => {
      if (!eventDraft.eventType) throw new Error(t('gift.typeRequired'))
      const description = eventDraft.description.trim()
      if (!description || description.length > 1024)
        throw new Error(t('gift.descriptionRequired'))
      const saved = creating.value
        ? await giftApi.createEvent({
            name: eventDraft.name.trim(),
            eventDate: eventDraft.eventDate,
            eventType: eventDraft.eventType,
            description,
          })
        : await giftApi.updateEvent(event.value!.id, {
            ...eventDraft,
            name: eventDraft.name.trim(),
            eventType: eventDraft.eventType,
            description,
            expectedVersion,
          })
      void notifySaved(
        t(creating.value ? 'gift.createdEvent' : 'gift.updatedEvent'),
      )
      eventOpen.value = false
      await refreshAfterWrite(saved.id)
    })
  }

  function openDisplay() {
    if (!event.value || !settings.value) return
    Object.assign(settingsDraft, settings.value)
    expectedVersion = settings.value.version
    displayLink.value =
      issuedLinks.get(event.value.id) || readDisplayLink(event.value.id)
    task.error.value = ''
    displayOpen.value = true
  }

  async function saveDisplay() {
    if (!event.value) return
    await task.run(async () => {
      const title = settingsDraft.title.trim()
      if (!title || title.length > 128)
        throw new Error(t('gift.displayTitleRequired'))
      const id = event.value!.id
      const saved = await giftApi.updateSettings(id, {
        title,
        photoDataUrl: settingsDraft.photoDataUrl,
        columnsPerPage: settingsDraft.columnsPerPage,
        expectedVersion,
      })
      expectedVersion = saved.version
      void notifySaved(t('gift.savedSettings'))
      displayOpen.value = false
      await refreshAfterWrite(id)
    })
  }

  async function photo(file: File) {
    await task.run(async () => {
      settingsDraft.photoDataUrl = await readActivityPhoto(file)
      void notifySaved(t('gift.selectedPhoto'))
    })
    return false
  }

  function removePhoto() {
    if (!settingsDraft.photoDataUrl || task.busy.value) return
    settingsDraft.photoDataUrl = null
    void notifySaved(t('gift.removedPhoto'))
  }

  /** The write is already committed: a later read failure must never turn its success into a failed write. */
  async function refreshAfterWrite(id: string) {
    try {
      await reload(id)
    } catch {
      task.error.value = t('gift.refreshError')
    }
  }

  /** Reuse the saved full link. Issuing on another browser preserves all existing links; only explicit rotation revokes them. */
  async function generateDisplayLink(basePath: string, reset = false) {
    if (!event.value) return
    const id = event.value.id
    await task.run(async () => {
      const cached = issuedLinks.get(id) || readDisplayLink(id)
      if (!reset && cached) {
        displayLink.value = cached
        void notifySaved(t('gift.reusedLink'))
        return
      }
      const result = reset
        ? await giftApi.rotateDisplayToken(id)
        : await giftApi.issueDisplayToken(id)
      const url = new URL(basePath, window.location.origin)
      url.hash = new URLSearchParams({ token: result.token }).toString()
      const link = url.toString()
      issuedLinks.set(id, link)
      cacheDisplayLink(id, link)
      if (event.value?.id === id) displayLink.value = link
      void notifySaved(t(reset ? 'gift.resetLink' : 'gift.generatedLink'))
    })
  }

  async function backup() {
    if (!event.value) return
    await task.run(async () => {
      downloadBackup(await giftApi.backup(event.value!.id))
      void notifySaved(t('gift.downloadedBackup'))
    })
  }

  async function restore(file: File) {
    await task.run(async () => {
      const restored = await giftApi.restore(await readBackup(file))
      void notifySaved(t('gift.restored'))
      await refreshAfterWrite(restored.id)
    })
    return false
  }
  return {
    task,
    eventOpen,
    displayOpen,
    creating,
    previewOpen,
    preview,
    eventPreview,
    openPreview,
    eventDraft,
    settingsDraft,
    displayLink,
    openEvent,
    saveEvent,
    openDisplay,
    saveDisplay,
    photo,
    removePhoto,
    generateDisplayLink,
    backup,
    restore,
  }
}
