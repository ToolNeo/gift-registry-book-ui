<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  ConfigProvider as AConfigProvider,
  Card as ACard,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Empty as AEmpty,
  FormItem as AFormItem,
  Input as AInput,
  InputNumber as AInputNumber,
  Modal as AModal,
  Popconfirm as APopconfirm,
  Select as ASelect,
  Space as ASpace,
  Statistic as AStatistic,
  Tag as ATag,
  Timeline as ATimeline,
  TimelineItem as ATimelineItem,
  Upload as AUpload,
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import dayjs from 'dayjs'
import PageContainer from '@/shared/components/PageContainer.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import FormModal from '@/shared/components/FormModal.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ProQuery from '@/shared/components/ProQuery.vue'
import type { QueryField } from '@/shared/api/types'
import { usePermissions } from '@/shared/auth/provider'
import { useTask } from '@/shared/composables/useTask'
import { copyText, saved as notifySaved } from '@/shared/utils/feedback'
import EntryForm from '../components/EntryForm.vue'
import { useWorkspace } from '../hooks/useWorkspace'
import { useEntryEditor } from '../hooks/useEntryEditor'
import { useEventSettings } from '../hooks/useEventSettings'
import { useGiftEntitlements } from '../hooks/useGiftEntitlements'
import GiftQuotaNotice from '../components/GiftQuotaNotice.vue'
import { giftApi } from '../api'
import { formatAmount } from '../utils/money'
import { resolveActivityPhotoUrl } from '../utils/photos'
import '../gift-registry.css'
import type { EntryAudit, GiftEntry } from '../types'

defineOptions({ name: 'GiftRegistryWorkspace' })
const DisplayBook = defineAsyncComponent(
  () => import('../components/DisplayBook.vue'),
)
const EventFormModal = defineAsyncComponent(
  () => import('../components/EventFormModal.vue'),
)
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const permissions = usePermissions()
const canSave = computed(() => permissions.can('gift-registry:save'))
const {
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
} = useWorkspace(
  typeof route.query.eventId === 'string' ? route.query.eventId : undefined,
)
const editOpen = ref(false)
const entitlement = useGiftEntitlements(eventId)

/** A committed save clears its form first; refresh errors are reported independently from the write outcome. */
async function saved() {
  await refresh()
  await entitlement.usage.load()
  await nextTick()
  document
    .querySelector<HTMLInputElement>('[data-testid="entry-name"]')
    ?.focus()
}
const quick = useEntryEditor(eventId, saved)
const editor = useEntryEditor(eventId, async () => {
  editOpen.value = false
  await refresh()
})
const config = useEventSettings(event, settings, entries, async (id) => {
  await loadEvents(id)
  await entitlement.usage.load()
})
/** Activity management reuses this editor after selecting the requested event, including legacy details. */
watch(event, (current) => {
  if (
    current?.id === route.query.eventId &&
    route.query.edit === '1' &&
    canSave.value
  ) {
    config.openEvent()
    void router.replace({ query: { ...route.query, edit: undefined } })
  }
})
const action = useTask()
const locked = computed(
  () =>
    quick.saving.value ||
    quick.uncertain.value ||
    editor.saving.value ||
    config.task.busy.value ||
    action.busy.value,
)
const voidOpen = ref(false)
const voidTarget = shallowRef<GiftEntry>()
const voidDraft = reactive({ reason: '' })
const auditOpen = ref(false)
const auditRows = shallowRef<EntryAudit[]>([])
const auditTarget = shallowRef<GiftEntry>()
const auditLoading = ref(false)
const auditError = ref('')
const queryFields = computed<QueryField[]>(() => [
  { key: 'name', label: 'gift.entryName' },
  {
    key: 'paymentMethod',
    label: 'gift.payment',
    type: 'select',
    options: ['CASH', 'WECHAT'].map((value) => ({
      value,
      label: t(`gift.${value}`),
    })),
  },
  {
    key: 'status',
    label: 'common.status',
    type: 'select',
    options: ['VALID', 'VOID'].map((value) => ({
      value,
      label: t(`gift.${value}`),
    })),
  },
  { key: 'createdAt', label: 'gift.time', type: 'date' },
])
const columns = computed<TableColumnsType<GiftEntry>>(() => [
  { title: t('gift.sequence'), dataIndex: 'seq', width: 80 },
  { title: t('gift.entryName'), dataIndex: 'name', width: 150 },
  {
    title: t('gift.amount'),
    dataIndex: 'amountCents',
    width: 150,
    align: 'right',
  },
  { title: t('gift.payment'), dataIndex: 'paymentMethod', width: 100 },
  {
    title: t('gift.attendeeCount'),
    dataIndex: 'attendeeCount',
    width: 110,
    align: 'right',
  },
  { title: t('gift.remark'), dataIndex: 'remark', width: 180 },
  { title: t('common.status'), dataIndex: 'status', width: 100 },
  { title: t('gift.createdAt'), dataIndex: 'createdAt', width: 180 },
  ...(entitlement.usage.data.value?.membership.state === 'EXEMPT'
    ? [
        {
          title: t('gift.creatorName'),
          dataIndex: 'creatorName',
          width: 160,
          ellipsis: { showTitle: false },
        },
      ]
    : []),
  {
    title: t('common.actions'),
    dataIndex: 'actions',
    width: 230,
    fixed: 'right',
  },
])
const statistics = computed(() =>
  summary.value
    ? [
        {
          key: 'totalAmount',
          value: formatAmount(summary.value.totalAmountCents),
          money: true,
        },
        {
          key: 'totalEntries',
          value: summary.value.totalEntries,
        },
        {
          key: 'cashAmount',
          value: formatAmount(summary.value.cashAmountCents),
          money: true,
        },
        {
          key: 'wechatAmount',
          value: formatAmount(summary.value.wechatAmountCents),
          money: true,
        },
        {
          key: 'totalAttendees',
          value: summary.value.totalAttendees,
        },
        {
          key: 'unknownAttendees',
          value: summary.value.unregisteredAttendeeEntries,
        },
      ]
    : [],
)
const eventOptions = computed(() =>
  events.value.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.eventDate}${item.status === 'CLOSED' ? ` · ${t('gift.closed')}` : ''}`,
  })),
)

function editEntry(entry: GiftEntry) {
  editor.reset(entry)
  editOpen.value = true
}
function openVoid(entry: GiftEntry) {
  voidTarget.value = entry
  voidDraft.reason = ''
  action.error.value = ''
  voidOpen.value = true
}

/** Void uses the visible row version and never removes the original or its audit history. */
async function confirmVoid() {
  if (!voidTarget.value || !voidDraft.reason.trim()) return
  await action.run(async () => {
    await giftApi.voidEntry(
      eventId.value,
      voidTarget.value!.id,
      voidTarget.value!.version,
      voidDraft.reason.trim(),
    )
    void notifySaved(t('gift.voidedEntry'))
    voidOpen.value = false
    await refresh()
  })
}

/** The audit modal captures its target so a slow earlier lookup cannot paint a later record. */
async function openAudit(entry: GiftEntry) {
  auditTarget.value = entry
  auditRows.value = []
  auditOpen.value = true
  auditLoading.value = true
  auditError.value = ''
  try {
    const rows = await giftApi.audit(eventId.value, entry.id)
    if (auditTarget.value?.id === entry.id) auditRows.value = rows
  } catch (cause) {
    if (auditTarget.value?.id === entry.id)
      auditError.value =
        cause instanceof Error ? cause.message : t('gift.requestFailed')
  } finally {
    if (auditTarget.value?.id === entry.id) auditLoading.value = false
  }
}

/** Render the bounded business fields of a saved audit snapshot rather than exposing raw JSON internals. */
function auditValues(json: string | null) {
  if (!json) return []
  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return []
    data = parsed as Record<string, unknown>
  } catch {
    return []
  }
  return [
    { label: t('gift.entryName'), value: String(data.name || '') },
    {
      label: t('gift.amount'),
      value:
        typeof data.amountCents === 'number'
          ? formatAmount(data.amountCents)
          : '--',
    },
    {
      label: t('gift.payment'),
      value:
        data.paymentMethod === 'CASH' || data.paymentMethod === 'WECHAT'
          ? t(`gift.${data.paymentMethod}`)
          : '--',
    },
    {
      label: t('gift.attendeeCount'),
      value:
        data.attendeeCount === null || data.attendeeCount === undefined
          ? t('gift.unregistered')
          : String(data.attendeeCount),
    },
    { label: t('gift.remark'), value: String(data.remark || '--') },
    {
      label: t('common.status'),
      value:
        data.status === 'VALID' || data.status === 'VOID'
          ? t(`gift.${data.status}`)
          : '--',
    },
  ]
}

function cellValue(record: GiftEntry, key: string) {
  if (key === 'seq') return record.seq
  if (key === 'name') return record.name
  if (key === 'remark') return record.remark || '--'
  return ''
}

function generateLink(reset = false) {
  void config.generateDisplayLink(
    router.resolve({ name: 'gift-display', params: { eventId: eventId.value } })
      .href,
    reset,
  )
}

async function copyDisplay() {
  await copyText(config.displayLink.value)
}
</script>

<template>
  <a-config-provider>
    <page-container class="gift-management-page" :title="t('gift.title')">
      <template #actions>
        <a-space wrap>
          <a-button
            v-if="canSave"
            :disabled="locked || !entitlement.canCreateEvent.value"
            @click="config.openEvent(true)"
            >{{ t('gift.newEvent') }}</a-button
          >
          <a-upload
            v-if="canSave && permissions.can('gift-registry:restore')"
            :show-upload-list="false"
            accept=".json,application/json"
            :before-upload="config.restore"
            :disabled="locked || !entitlement.canRestore.value"
          >
            <a-button
              :disabled="locked || !entitlement.canRestore.value"
              :loading="config.task.busy.value"
              >{{ t('gift.restore') }}</a-button
            >
          </a-upload>
        </a-space>
      </template>
      <div class="gift-workspace stack">
        <div class="panel gift-event-context">
          <div class="gift-event-bar">
            <div class="gift-event-picker">
              <label for="gift-event-select">{{ t('gift.event') }}</label
              ><a-select
                id="gift-event-select"
                :value="eventId || undefined"
                :options="eventOptions"
                :placeholder="t('gift.noEvent')"
                :loading="eventLoading"
                :disabled="locked"
                @change="(value) => select(String(value))"
              />
            </div>
            <a-space wrap>
              <a-button
                v-if="canSave && event"
                :disabled="locked"
                @click="config.openEvent()"
                >{{ t('gift.editEvent') }}</a-button
              >
              <a-button
                v-if="canSave && event"
                :disabled="locked"
                @click="config.openDisplay"
                >{{ t('gift.displaySettings') }}</a-button
              >
              <a-button
                v-if="event && permissions.can('gift-registry:backup')"
                :disabled="locked || !entitlement.canBackup.value"
                @click="config.backup"
                >{{ t('gift.backup') }}</a-button
              >
              <a-button
                :disabled="locked"
                :loading="eventLoading"
                @click="eventId ? refresh() : loadEvents()"
                >{{ t('common.refresh') }}</a-button
              >
            </a-space>
          </div>
          <gift-quota-notice
            :usage="entitlement.usage.data.value"
            :error="
              entitlement.usage.error.value || entitlement.membership.error
            "
            :loading="entitlement.usage.loading.value"
            :center-path="entitlement.membership.centerPath"
            :advanced="entitlement.membership.unlimited"
            @refresh="entitlement.refresh"
            @center="
              entitlement.membership.centerPath &&
              router.push(entitlement.membership.centerPath)
            "
          />
        </div>
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <a-alert
          v-if="
            config.task.error.value &&
            !config.eventOpen.value &&
            !config.displayOpen.value
          "
          type="error"
          :message="config.task.error.value"
          show-icon
        />
        <a-empty
          v-if="!event && !eventLoading && !error"
          :description="t('gift.noEvent')"
        />
        <template v-if="event">
          <a-alert
            v-if="!selectedActive"
            type="info"
            :message="t('gift.closedHint')"
            show-icon
          />
          <a-card
            v-if="canSave"
            class="gift-entry-card"
            :title="t('gift.quickEntry')"
          >
            <entry-form
              :model="quick.draft"
              :busy="quick.saving.value"
              :disabled="
                !selectedActive ||
                (!entitlement.canCreateEntry.value && !quick.uncertain.value)
              "
              :uncertain="quick.uncertain.value"
              :error="quick.error.value"
              :duplicates="quick.duplicates.value"
              :confirm-duplicates="quick.confirmDuplicates.value"
              @submit="quick.submit"
            />
          </a-card>
          <div class="panel gift-statistics">
            <div
              v-for="statistic in statistics"
              :key="statistic.key"
              class="gift-statistic-card"
              :class="{
                'gift-statistic-card--total': statistic.key === 'totalAmount',
                'gift-statistic-card--money': statistic.money,
              }"
            >
              <a-statistic :value="statistic.value">
                <template #title>
                  <span class="gift-statistic-label">{{
                    t(`gift.${statistic.key}`)
                  }}</span>
                </template>
                <template v-if="statistic.money" #suffix>
                  <span class="gift-statistic-unit">{{
                    t('gift.amountYuan')
                  }}</span>
                </template>
              </a-statistic>
            </div>
          </div>
          <a-card class="gift-ledger-card" :title="t('gift.entries')">
            <template #extra
              ><a-button
                v-if="permissions.can('gift-registry:export')"
                :loading="exportTask.busy.value"
                :disabled="
                  loading || eventLoading || !entitlement.canExport.value
                "
                @click="exportEntries"
                >{{ t('gift.exportEntries') }}</a-button
              ></template
            >
            <pro-query
              :key="eventId"
              :fields="queryFields"
              target="gift-registry-entries"
              @search="search"
            />
            <a-alert
              v-if="exportTask.error.value"
              type="error"
              :message="exportTask.error.value"
              show-icon
            />
            <a-alert
              v-if="listError"
              type="error"
              :message="listError"
              show-icon
              ><template #action
                ><a-button @click="loadEntries">{{
                  t('common.retry')
                }}</a-button></template
              ></a-alert
            >
            <data-table
              :rows="entries"
              :columns="columns"
              :pagination="pagination"
              :loading="loading"
              @page="page"
            >
              <template #cell="{ record, column }">
                <template v-if="column.dataIndex === 'amountCents'">{{
                  formatAmount(record.amountCents)
                }}</template>
                <text-ellipsis
                  v-else-if="column.dataIndex === 'creatorName'"
                  :text="record.creatorName || '--'"
                />
                <template v-else-if="column.dataIndex === 'paymentMethod'">{{
                  t(`gift.${record.paymentMethod}`)
                }}</template>
                <template v-else-if="column.dataIndex === 'attendeeCount'">{{
                  record.attendeeCount ?? t('gift.unregistered')
                }}</template>
                <a-tag
                  v-else-if="column.dataIndex === 'status'"
                  :color="record.status === 'VOID' ? 'default' : 'green'"
                  >{{ t(`gift.${record.status}`) }}</a-tag
                >
                <template v-else-if="column.dataIndex === 'createdAt'">{{
                  record.createdAt == null
                    ? '--'
                    : dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')
                }}</template>
                <a-space v-else-if="column.dataIndex === 'actions'">
                  <a-button
                    v-if="canSave"
                    type="link"
                    size="small"
                    :disabled="
                      locked || !selectedActive || record.status === 'VOID'
                    "
                    @click="editEntry(record)"
                    >{{ t('common.edit') }}</a-button
                  >
                  <a-button
                    v-if="canSave"
                    type="link"
                    size="small"
                    danger
                    :disabled="
                      locked || !selectedActive || record.status === 'VOID'
                    "
                    @click="openVoid(record)"
                    >{{ t('gift.void') }}</a-button
                  >
                  <a-button
                    type="link"
                    size="small"
                    @click="openAudit(record)"
                    >{{ t('gift.audit') }}</a-button
                  >
                </a-space>
                <template v-else>{{
                  cellValue(record, column.dataIndex)
                }}</template>
              </template>
            </data-table>
            <p
              v-if="
                permissions.can('gift-registry:export') ||
                permissions.can('gift-registry:backup') ||
                permissions.can('gift-registry:restore')
              "
              class="gift-file-limits muted"
            >
              {{ t('membership.fileLimits') }}
            </p>
          </a-card>
        </template>
      </div>
      <event-form-modal
        :open="config.eventOpen.value"
        :creating="config.creating.value"
        :model="config.eventDraft"
        :busy="config.task.busy.value"
        :error="config.task.error.value"
        :preview="config.eventPreview.value"
        @cancel="config.eventOpen.value = false"
        @submit="config.saveEvent"
      />
      <a-modal
        wrap-class-name="gift-management-modal"
        :open="editOpen"
        :title="t('gift.editEntry')"
        :footer="null"
        :mask-closable="false"
        :width="820"
        @cancel="!editor.saving.value && (editOpen = false)"
      >
        <entry-form
          :model="editor.draft"
          editing
          :busy="editor.saving.value"
          :error="editor.error.value"
          :duplicates="editor.duplicates.value"
          :confirm-duplicates="editor.confirmDuplicates.value"
          @submit="editor.submit"
        />
      </a-modal>
      <form-modal
        wrap-class-name="gift-management-modal"
        :open="voidOpen"
        :title="t('gift.voidTitle')"
        :model="voidDraft"
        :busy="action.busy.value"
        :error="action.error.value"
        :width="560"
        @cancel="voidOpen = false"
        @submit="confirmVoid"
      >
        <p v-if="voidTarget">
          #{{ voidTarget.seq }} {{ voidTarget.name }} ·
          {{ formatAmount(voidTarget.amountCents) }} {{ t('gift.amountYuan') }}
        </p>
        <a-form-item
          name="reason"
          :label="t('gift.reason')"
          :rules="[
            {
              required: true,
              whitespace: true,
              message: t('gift.reasonRequired'),
            },
          ]"
          ><a-input v-model:value="voidDraft.reason" :maxlength="500"
        /></a-form-item>
      </form-modal>
      <form-modal
        wrap-class-name="gift-management-modal"
        :open="config.displayOpen.value"
        :title="t('gift.displaySettings')"
        :model="config.settingsDraft"
        :busy="config.task.busy.value"
        :error="config.task.error.value"
        :width="880"
        @cancel="config.displayOpen.value = false"
        @submit="config.saveDisplay"
      >
        <section class="gift-settings-section">
          <div class="gift-settings-heading">
            <h3>{{ t('gift.displayLayout') }}</h3>
            <a-button @click="config.openPreview()">{{
              t('gift.preview')
            }}</a-button>
          </div>
          <div class="gift-settings-fields">
            <a-form-item
              name="title"
              :label="t('gift.displayTitle')"
              :rules="[
                {
                  required: true,
                  whitespace: true,
                  max: 128,
                  transform: (value: string) => value?.trim(),
                  message: t('gift.displayTitleRequired'),
                },
              ]"
              ><a-input
                v-model:value="config.settingsDraft.title"
                :maxlength="128"
                show-count
            /></a-form-item>
            <a-form-item
              name="columnsPerPage"
              :label="t('gift.columns')"
              :rules="[
                {
                  required: true,
                  type: 'number',
                  min: 1,
                  max: 24,
                  message: t('common.invalid'),
                },
              ]"
              ><a-input-number
                v-model:value="config.settingsDraft.columnsPerPage"
                :min="1"
                :max="24"
                :precision="0"
            /></a-form-item>
          </div>
        </section>
        <section class="gift-settings-section">
          <div class="gift-settings-heading">
            <h3>{{ t('gift.photo') }}</h3>
          </div>
          <div class="gift-photo-editor">
            <div class="gift-photo-card">
              <img
                v-if="config.settingsDraft.photoUrl"
                class="gift-photo-preview"
                :src="resolveActivityPhotoUrl(config.settingsDraft.photoUrl)"
                :alt="t('gift.photo')"
              />
              <a-empty
                v-else
                :image="AEmpty.PRESENTED_IMAGE_SIMPLE"
                :description="t('gift.photoPlaceholder')"
              />
            </div>
            <div class="stack gift-photo-actions">
              <p class="muted">{{ t('gift.photoHint') }}</p>
              <a-space wrap>
                <a-upload
                  accept="image/png,image/jpeg,image/webp"
                  :show-upload-list="false"
                  :before-upload="config.photo"
                  :disabled="config.task.busy.value"
                >
                  <a-button :disabled="config.task.busy.value">{{
                    t('gift.choosePhoto')
                  }}</a-button>
                </a-upload>
                <a-button
                  v-if="config.settingsDraft.photoUrl"
                  :disabled="config.task.busy.value"
                  @click="config.removePhoto"
                  >{{ t('gift.removePhoto') }}</a-button
                >
              </a-space>
            </div>
          </div>
        </section>
        <section class="gift-settings-section">
          <div class="gift-settings-heading">
            <h3>{{ t('gift.displayLink') }}</h3>
          </div>
          <p class="muted gift-link-hint">{{ t('gift.linkReuseHint') }}</p>
          <a-space wrap>
            <a-button
              :loading="config.task.busy.value"
              :disabled="config.task.busy.value"
              @click="generateLink()"
              >{{ t('gift.generateDisplay') }}</a-button
            >
            <a-popconfirm
              :title="t('gift.rotateHint')"
              :ok-text="t('gift.confirmReset')"
              :cancel-text="t('common.cancel')"
              @confirm="generateLink(true)"
              ><a-button danger :disabled="config.task.busy.value">{{
                t('gift.resetDisplay')
              }}</a-button></a-popconfirm
            >
          </a-space>
          <div v-if="config.displayLink.value" class="gift-link-result">
            <a-input
              :value="config.displayLink.value"
              readonly
              :aria-label="t('gift.displayLink')"
            /><a-space wrap
              ><a-button @click="copyDisplay">{{
                t('gift.copyDisplay')
              }}</a-button
              ><a-button
                :href="config.displayLink.value"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('gift.openDisplay') }}</a-button
              ></a-space
            >
          </div>
        </section>
      </form-modal>
      <a-modal
        wrap-class-name="gift-management-modal"
        :open="config.previewOpen.value"
        :title="t('gift.preview')"
        :width="'95vw'"
        :footer="null"
        @cancel="config.previewOpen.value = false"
        ><div class="gift-preview">
          <display-book :snapshot="config.preview.value" /></div
      ></a-modal>
      <a-modal
        wrap-class-name="gift-management-modal"
        :open="auditOpen"
        :title="`${t('gift.audit')}${auditTarget ? ` · ${auditTarget.name}` : ''}`"
        :footer="null"
        :width="880"
        @cancel="auditOpen = false"
      >
        <load-state
          :loading="auditLoading"
          :error="auditError"
          :empty="!auditRows.length"
          @retry="auditTarget && openAudit(auditTarget)"
        >
          <a-timeline
            ><a-timeline-item v-for="row in auditRows" :key="row.id"
              ><p>
                {{
                  t(
                    row.action === 'VOID'
                      ? 'gift.VOID_ACTION'
                      : `gift.${row.action}`,
                  )
                }}
                · {{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') }} ·
                {{ t('gift.actor') }}
                <span :title="row.actorId">{{
                  row.actorName && row.actorName !== row.actorId
                    ? row.actorName
                    : t('gift.historicalActor')
                }}</span>
              </p>
              <p>{{ t('gift.reason') }}：{{ row.reason || '--' }}</p>
              <div class="gift-audit-values">
                <a-descriptions
                  :title="t('gift.before')"
                  :column="1"
                  size="small"
                  bordered
                  ><a-descriptions-item
                    v-for="field in auditValues(row.beforeJson)"
                    :key="field.label"
                    :label="field.label"
                    >{{ field.value }}</a-descriptions-item
                  ></a-descriptions
                ><a-descriptions
                  :title="t('gift.after')"
                  :column="1"
                  size="small"
                  bordered
                  ><a-descriptions-item
                    v-for="field in auditValues(row.afterJson)"
                    :key="field.label"
                    :label="field.label"
                    >{{ field.value }}</a-descriptions-item
                  ></a-descriptions
                >
              </div></a-timeline-item
            ></a-timeline
          >
        </load-state>
      </a-modal>
    </page-container>
  </a-config-provider>
</template>

<style scoped>
.gift-workspace {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.gift-workspace > * {
  min-width: 0;
}
.gift-event-context {
  display: grid;
  gap: var(--space-4);
}
.gift-event-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-4);
}
.gift-event-picker {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 280px;
  flex: 1;
  max-width: 640px;
}
.gift-event-picker .ant-select {
  flex: 1;
  min-width: 160px;
}
.gift-statistics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-6) var(--space-8);
}
.gift-statistic-card {
  min-width: 0;
  container-type: inline-size;
}
.gift-statistic-label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--color-muted);
  font-size: var(--text-body);
}
.gift-statistic-card :deep(.ant-statistic-content) {
  color: var(--color-text);
  font-size: clamp(20px, 12cqi, 26px);
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.gift-statistic-card--money :deep(.ant-statistic-content) {
  font-size: clamp(14px, 9cqi, 26px);
}
.gift-statistic-card--total :deep(.ant-statistic-content) {
  color: var(--color-primary);
}
.gift-statistic-unit {
  color: var(--color-muted);
  font-size: var(--text-body);
  font-weight: 400;
}
.gift-photo-preview {
  display: block;
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
}
.gift-settings-section {
  padding-block: var(--space-6);
  margin-bottom: 0;
  border-bottom: 1px solid var(--color-border);
}
.gift-settings-section:first-child {
  padding-top: 0;
}
.gift-settings-section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.gift-settings-fields {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
  gap: var(--space-4);
}
.gift-settings-fields .ant-form-item,
.gift-settings-section .ant-form-item:last-child {
  margin-bottom: 0;
}
.gift-settings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.gift-settings-heading h3 {
  margin: 0;
  font-size: 16px;
}
.gift-photo-editor {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
}
.gift-photo-card {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
}
.gift-photo-actions p {
  margin: 0;
}
.gift-link-hint {
  margin: 0 0 var(--space-4);
}
.gift-link-result {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.gift-file-limits {
  margin: var(--space-4) 0 0;
  font-size: var(--text-small);
  line-height: 1.6;
}
.gift-preview {
  height: 72vh;
  overflow: hidden;
}
.gift-audit-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  overflow-wrap: anywhere;
}
@media (width >= 1800px) {
  .gift-statistics {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
@media (width <= 1100px) {
  .gift-statistics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 600px) {
  .gift-statistic-card--total :deep(.ant-statistic-content) {
    color: var(--color-text);
  }
}
@media (width <= 360px) {
  .gift-statistics {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width <= 700px) {
  .gift-settings-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .gift-event-picker {
    width: 100%;
    min-width: 0;
  }
  .gift-audit-values {
    grid-template-columns: minmax(0, 1fr);
  }
  .gift-photo-editor {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
