import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import type { PageResult, Query, RequestOptions } from '@/shared/api/types'
import type {
  BackupBundle,
  DisplaySettings,
  DisplaySnapshot,
  EntryAudit,
  EntryInput,
  GiftEntry,
  GiftEvent,
  GiftSummary,
  GiftUsage,
} from '../types'

const root = '/gift-registry'
const eventPath = (id: string) => `${root}/events/${encodeURIComponent(id)}`
const entryPath = (eventId: string, id: string) =>
  `${eventPath(eventId)}/entries/${encodeURIComponent(id)}`

/** Management requests share the platform identity; display credentials never enter this client. */
export const giftApi = {
  usage: async (eventId?: string, options?: RequestOptions) =>
    (
      await request.get<GiftUsage>(
        `${root}/usage`,
        eventId ? { eventId } : undefined,
        options,
      )
    ).result,
  events: async (query: Query = {}, options?: RequestOptions) =>
    (
      await request.post<PageResult<GiftEvent>>(
        `${root}/events/_query`,
        query,
        options,
      )
    ).result,
  createEvent: async (
    input: Pick<GiftEvent, 'name' | 'eventDate' | 'eventType' | 'description'>,
  ) => (await request.post<GiftEvent>(`${root}/events`, input)).result,
  event: async (id: string, options?: RequestOptions) =>
    (await request.get<GiftEvent>(eventPath(id), undefined, options)).result,
  updateEvent: async (
    id: string,
    input: Pick<
      GiftEvent,
      'name' | 'eventDate' | 'eventType' | 'description' | 'status'
    > & {
      expectedVersion: number
    },
  ) => (await request.put<GiftEvent>(eventPath(id), input)).result,
  deleteEvent: async (id: string, expectedVersion: number) =>
    (await request.remove<boolean>(eventPath(id), { expectedVersion })).result,
  exportEntries: (id: string, query: Query) =>
    request.postStream(`${eventPath(id)}/entries/_export`, query),
  entries: async (id: string, query: Query, options?: RequestOptions) =>
    (
      await request.post<PageResult<GiftEntry>>(
        `${eventPath(id)}/entries/_query`,
        query,
        options,
      )
    ).result,
  createEntry: async (id: string, input: EntryInput & { requestId: string }) =>
    (await request.post<GiftEntry>(`${eventPath(id)}/entries`, input)).result,
  updateEntry: async (
    eventId: string,
    id: string,
    input: EntryInput & { expectedVersion: number; reason: string },
  ) => (await request.put<GiftEntry>(entryPath(eventId, id), input)).result,
  voidEntry: async (
    eventId: string,
    id: string,
    expectedVersion: number,
    reason: string,
  ) =>
    (
      await request.post<GiftEntry>(`${entryPath(eventId, id)}/_void`, {
        expectedVersion,
        reason,
      })
    ).result,
  duplicates: async (
    eventId: string,
    name: string,
    excludeEntryId?: string,
    options?: RequestOptions,
  ) =>
    (
      await request.get<GiftEntry[]>(
        `${eventPath(eventId)}/duplicate-names`,
        { name: name.trim(), excludeEntryId },
        options,
      )
    ).result,
  summary: async (id: string, options?: RequestOptions) =>
    (
      await request.get<GiftSummary>(
        `${eventPath(id)}/summary`,
        undefined,
        options,
      )
    ).result,
  settings: async (id: string, options?: RequestOptions) =>
    (
      await request.get<DisplaySettings>(
        `${eventPath(id)}/display-settings`,
        undefined,
        options,
      )
    ).result,
  updateSettings: async (
    id: string,
    input: Omit<DisplaySettings, 'version'> & { expectedVersion: number },
  ) =>
    (
      await request.put<DisplaySettings>(
        `${eventPath(id)}/display-settings`,
        input,
      )
    ).result,
  issueDisplayToken: async (id: string) =>
    (
      await request.post<{ token: string }>(
        `${eventPath(id)}/display-token/_issue`,
      )
    ).result,
  rotateDisplayToken: async (id: string) =>
    (
      await request.post<{ token: string }>(
        `${eventPath(id)}/display-token/_rotate`,
      )
    ).result,
  audit: async (eventId: string, id: string) =>
    (await request.get<EntryAudit[]>(`${entryPath(eventId, id)}/audit`)).result,
  backup: async (id: string) =>
    (await request.get<BackupBundle>(`${eventPath(id)}/backup`)).result,
  restore: async (bundle: BackupBundle) =>
    (await request.post<GiftEvent>(`${root}/events/_restore`, bundle)).result,
}

/** This anonymous client strips management credentials, including when a display runs in an admin tab. */
export const displayApi = {
  version: async (id: string, token: string, signal?: AbortSignal) =>
    (
      await publicRequest.get<{ version: number }>(
        `${root}/display/${encodeURIComponent(id)}/version`,
        undefined,
        { headers: { 'X-Gift-Display-Token': token }, signal, silent: true },
      )
    ).result,
  snapshot: async (
    id: string,
    token: string,
    pageIndex: number,
    signal?: AbortSignal,
    pageSize?: number,
  ) =>
    (
      await publicRequest.get<DisplaySnapshot>(
        `${root}/display/${encodeURIComponent(id)}/snapshot`,
        { pageIndex, ...(pageSize ? { pageSize } : {}) },
        { headers: { 'X-Gift-Display-Token': token }, signal, silent: true },
      )
    ).result,
}
