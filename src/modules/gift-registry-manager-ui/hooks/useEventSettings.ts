import {
  computed,
  getCurrentScope,
  onScopeDispose,
  reactive,
  ref,
  watch,
  type Ref,
} from 'vue'
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

export interface EventDraft {
  name: string
  eventDate: string
  eventType: EventType | null
  description: string
  status: GiftEvent['status']
}

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
  const issuedLinks = new Map<string, string>()
  const eventDraft = reactive<EventDraft>({
    name: '',
    eventDate: '',
    eventType: null,
    description: '',
    status: 'ACTIVE',
  })
  const settingsDraft = reactive({
    title: '',
    photoUrl: null as string | null,
    columnsPerPage: 12,
  })
  let expectedVersion = 0
  let selectedPhoto: File | undefined
  let photoPreviewUrl: string | undefined
  let photoGeneration = 0
  let draftEventId: string | undefined

  function releasePhoto() {
    photoGeneration++
    selectedPhoto = undefined
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    photoPreviewUrl = undefined
  }
  // A closed or switched activity owns no local file, including a decode that finishes later.
  watch(
    displayOpen,
    (open) => {
      if (!open) releasePhoto()
    },
    { flush: 'sync' },
  )
  watch(
    () => event.value?.id,
    (id) => {
      if (id !== draftEventId) {
        displayOpen.value = false
        releasePhoto()
      }
    },
    { flush: 'sync' },
  )
  if (getCurrentScope()) onScopeDispose(releasePhoto)
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
      photoUrl: creating.value ? null : settings.value?.photoUrl || null,
      columnsPerPage: 6,
    },
    version: 0,
    latestEntrySeq: 0,
    entries: [],
    total: 0,
    pageIndex: 0,
    pageSize: 6,
  }))
  function openPreview() {
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
    releasePhoto()
    draftEventId = event.value.id
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
      const input = {
        title,
        columnsPerPage: settingsDraft.columnsPerPage,
        expectedVersion,
      }
      const saved = selectedPhoto
        ? await giftApi.updateSettingsPhoto(id, selectedPhoto, input)
        : await giftApi.updateSettings(id, {
            ...input,
            photoUrl: settingsDraft.photoUrl,
          })
      void notifySaved(t('gift.savedSettings'))
      if (event.value?.id === id) {
        expectedVersion = saved.version
        settingsDraft.photoUrl = saved.photoUrl
        displayOpen.value = false
        await refreshAfterWrite(id)
      }
    })
  }

  async function photo(file: File) {
    const id = event.value?.id
    const generation = photoGeneration
    await task.run(async () => {
      let url: string
      try {
        url = await readActivityPhoto(file)
      } catch (cause) {
        if (generation !== photoGeneration) return
        throw cause
      }
      if (
        generation !== photoGeneration ||
        !displayOpen.value ||
        event.value?.id !== id
      ) {
        URL.revokeObjectURL(url)
        return
      }
      releasePhoto()
      selectedPhoto = file
      photoPreviewUrl = url
      settingsDraft.photoUrl = url
      void notifySaved(t('gift.selectedPhoto'))
    })
    return false
  }

  function removePhoto() {
    if (!settingsDraft.photoUrl || task.busy.value) return
    releasePhoto()
    settingsDraft.photoUrl = null
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
    preview: displayPreview,
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
