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
  Radio as ARadio,
  RadioGroup as ARadioGroup,
  Select as ASelect,
  Space as ASpace,
  Statistic as AStatistic,
  Tag as ATag,
  Timeline as ATimeline,
  TimelineItem as ATimelineItem,
  Textarea as ATextarea,
  Upload as AUpload,
} from 'ant-design-vue'
import {
  AccountBookOutlined,
  MoneyCollectOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
  WechatOutlined,
} from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import dayjs from 'dayjs'
import PageContainer from '@/shared/components/PageContainer.vue'
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
import { giftApi } from '../api'
import { formatAmount } from '../utils/money'
import { eventPresets } from '../themes'
import '../gift-registry.css'
import type { EntryAudit, GiftEntry } from '../types'

defineOptions({ name: 'GiftRegistryWorkspace' })
const DisplayBook = defineAsyncComponent(
  () => import('../components/DisplayBook.vue'),
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

/** A committed save clears its form first; refresh errors are reported independently from the write outcome. */
async function saved() {
  await refresh()
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
const config = useEventSettings(event, settings, entries, loadEvents)
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
  { title: t('gift.time'), dataIndex: 'createdAt', width: 170 },
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
          icon: WalletOutlined,
          value: formatAmount(summary.value.totalAmountCents),
          money: true,
        },
        {
          key: 'totalEntries',
          icon: AccountBookOutlined,
          value: summary.value.totalEntries,
        },
        {
          key: 'cashAmount',
          icon: MoneyCollectOutlined,
          value: formatAmount(summary.value.cashAmountCents),
          money: true,
        },
        {
          key: 'wechatAmount',
          icon: WechatOutlined,
          value: formatAmount(summary.value.wechatAmountCents),
          money: true,
        },
        {
          key: 'totalAttendees',
          icon: TeamOutlined,
          value: summary.value.totalAttendees,
        },
        {
          key: 'unknownAttendees',
          icon: UserOutlined,
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
            :disabled="locked"
            @click="config.openEvent(true)"
            >{{ t('gift.newEvent') }}</a-button
          >
          <a-upload
            v-if="canSave"
            :show-upload-list="false"
            accept=".json,application/json"
            :before-upload="config.restore"
            :disabled="locked"
          >
            <a-button :disabled="locked" :loading="config.task.busy.value">{{
              t('gift.restore')
            }}</a-button>
          </a-upload>
        </a-space>
      </template>
      <div class="gift-workspace stack">
        <div class="panel gift-event-bar">
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
            <a-button v-if="event" :disabled="locked" @click="config.backup">{{
              t('gift.backup')
            }}</a-button>
            <a-button
              :disabled="locked"
              :loading="eventLoading"
              @click="eventId ? refresh() : loadEvents()"
              >{{ t('common.refresh') }}</a-button
            >
          </a-space>
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
          <div class="gift-statistics">
            <a-card
              v-for="statistic in statistics"
              :key="statistic.key"
              class="gift-statistic-card"
              :class="{
                'gift-statistic-card--total': statistic.key === 'totalAmount',
                'gift-statistic-card--money': statistic.money,
              }"
              size="small"
            >
              <a-statistic :value="statistic.value">
                <template #title>
                  <span class="gift-statistic-label">
                    <span>{{ t(`gift.${statistic.key}`) }}</span>
                    <component
                      :is="statistic.icon"
                      class="gift-statistic-icon"
                      aria-hidden="true"
                    />
                  </span>
                </template>
                <template v-if="statistic.money" #suffix>
                  <span class="gift-statistic-unit">{{
                    t('gift.amountYuan')
                  }}</span>
                </template>
              </a-statistic>
            </a-card>
          </div>
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
              :disabled="!selectedActive"
              :uncertain="quick.uncertain.value"
              :error="quick.error.value"
              :duplicates="quick.duplicates.value"
              :confirm-duplicates="quick.confirmDuplicates.value"
              @submit="quick.submit"
            />
          </a-card>
          <a-card class="gift-ledger-card" :title="t('gift.entries')">
            <template #extra
              ><a-button
                :loading="exportTask.busy.value"
                :disabled="loading || eventLoading"
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
                  dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')
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
          </a-card>
        </template>
      </div>
      <form-modal
        wrap-class-name="gift-management-modal"
        :open="config.eventOpen.value"
        :title="t(config.creating.value ? 'gift.newEvent' : 'gift.editEvent')"
        :model="config.eventDraft"
        :busy="config.task.busy.value"
        :error="config.task.error.value"
        :width="1000"
        @cancel="config.eventOpen.value = false"
        @submit="config.saveEvent"
      >
        <a-form-item
          name="eventType"
          :label="t('gift.eventType')"
          :rules="[{ required: true, message: t('gift.typeRequired') }]"
        >
          <a-radio-group
            v-model:value="config.eventDraft.eventType"
            class="gift-preset-options"
          >
            <a-radio
              v-for="preset in eventPresets"
              :key="preset.value"
              :value="preset.value"
              class="gift-preset-card"
              :class="`gift-preset-card--${preset.value.toLowerCase()}`"
            >
              <span class="gift-preset-swatch" aria-hidden="true">{{
                preset.ornament || '✾'
              }}</span>
              <strong>{{ t(`gift.${preset.value}`) }}</strong>
              <span class="gift-preset-hint">{{
                t(`gift.preset_${preset.value}`)
              }}</span>
            </a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          name="name"
          :label="t('gift.eventName')"
          :rules="[
            { required: true, whitespace: true, message: t('common.required') },
          ]"
          ><a-input v-model:value="config.eventDraft.name" :maxlength="100"
        /></a-form-item>
        <a-form-item
          name="description"
          :label="t('gift.description')"
          :rules="[
            {
              required: true,
              whitespace: true,
              max: 1024,
              message: t('gift.descriptionRequired'),
            },
          ]"
          ><a-textarea
            v-model:value="config.eventDraft.description"
            :maxlength="1024"
            :auto-size="{ minRows: 2, maxRows: 4 }"
            show-count
        /></a-form-item>
        <a-form-item
          name="eventDate"
          :label="t('gift.eventDate')"
          :rules="[{ required: true, message: t('common.required') }]"
          ><a-input v-model:value="config.eventDraft.eventDate" type="date"
        /></a-form-item>
        <section
          v-if="config.eventDraft.eventType"
          class="gift-event-preview-section"
        >
          <div class="gift-event-preview-heading">
            <strong>{{ t('gift.stylePreview') }}</strong
            ><a-button type="link" @click="config.openPreview('event')">{{
              t('gift.enlargePreview')
            }}</a-button>
          </div>
          <div class="gift-event-style-preview">
            <display-book :snapshot="config.eventPreview.value" />
          </div>
        </section>
        <a-form-item
          v-if="!config.creating.value"
          name="status"
          :label="t('gift.eventStatus')"
          ><a-select
            v-model:value="config.eventDraft.status"
            :options="[
              { value: 'ACTIVE', label: t('gift.active') },
              { value: 'CLOSED', label: t('gift.closed') },
            ]"
        /></a-form-item>
      </form-modal>
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
            <a-button @click="config.openPreview('display')">{{
              t('gift.preview')
            }}</a-button>
          </div>
          <a-form-item
            name="title"
            :label="t('gift.displayTitle')"
            :extra="t('gift.displayTitleHint')"
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
        </section>
        <section class="gift-settings-section">
          <div class="gift-settings-heading">
            <h3>{{ t('gift.photo') }}</h3>
          </div>
          <div class="gift-photo-editor">
            <div class="gift-photo-card">
              <img
                v-if="config.settingsDraft.photoDataUrl"
                class="gift-photo-preview"
                :src="config.settingsDraft.photoDataUrl"
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
                  v-if="config.settingsDraft.photoDataUrl"
                  :disabled="config.task.busy.value"
                  @click="config.removePhoto"
                  >{{ t('gift.removePhoto') }}</a-button
                >
              </a-space>
              <p class="muted">{{ t('gift.photoDraftHint') }}</p>
            </div>
          </div>
        </section>
        <section class="gift-settings-section gift-display-link stack">
          <div class="gift-settings-heading">
            <h3>{{ t('gift.displayLink') }}</h3>
          </div>
          <a-alert type="info" :message="t('gift.linkReuseHint')" show-icon />
          <a-button
            :loading="config.task.busy.value"
            :disabled="config.task.busy.value"
            @click="generateLink()"
            >{{ t('gift.generateDisplay') }}</a-button
          >
          <template v-if="config.displayLink.value"
            ><a-input
              :value="config.displayLink.value"
              readonly
              :aria-label="t('gift.displayLink')"
            /><a-space
              ><a-button @click="copyDisplay">{{
                t('gift.copyDisplay')
              }}</a-button
              ><a-button
                :href="config.displayLink.value"
                target="_blank"
                rel="noopener noreferrer"
                >{{ t('gift.openDisplay') }}</a-button
              ></a-space
            ></template
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
.gift-preset-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  width: 100%;
}
.gift-preset-card {
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: #8e2630;
  color: #ffe6ad;
  align-items: flex-start;
}
.gift-preset-card--birthday {
  background: #9b2b20;
  color: #ffefbc;
}
.gift-preset-card--funeral {
  background: #f8f9f5;
  color: #3e4a41;
}
.gift-preset-card.ant-radio-wrapper-checked {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.gift-preset-card :deep(.ant-radio + span) {
  flex: 1;
  min-width: 0;
}
.gift-preset-swatch {
  display: block;
  font-family: 'Gift Handwriting', serif;
  font-size: 40px;
  line-height: 1.2;
  margin-bottom: var(--space-2);
}
.gift-preset-hint {
  display: block;
  font-size: 12px;
  margin-top: var(--space-2);
  line-height: 1.5;
}
.gift-event-preview-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gift-event-style-preview {
  height: 480px;
  overflow: hidden;
  margin-bottom: var(--space-4);
}
.gift-event-style-preview :deep(.gift-book) {
  height: 480px;
  min-height: 480px;
  grid-template-columns: minmax(170px, 28%) minmax(0, 1fr);
}
.gift-event-style-preview :deep(.gift-book-event h1) {
  font-size: 26px;
}
.gift-event-style-preview :deep(.gift-book-description) {
  font-size: 15px;
}
.gift-event-style-preview :deep(.gift-book-emblem) {
  font-size: 90px;
}
.gift-event-style-preview :deep(.gift-book-photo) {
  max-height: 220px;
}
.gift-workspace {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.gift-workspace > * {
  min-width: 0;
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
  gap: var(--space-3);
}
.gift-statistic-card {
  min-width: 0;
  container-type: inline-size;
}
.gift-statistic-card :deep(.ant-card-body) {
  padding: var(--space-4);
}
.gift-statistic-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  color: var(--color-muted);
  font-size: var(--text-body);
}
.gift-statistic-icon {
  flex: none;
  color: var(--color-muted);
  font-size: 18px;
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
.gift-statistic-card--total :deep(.ant-statistic-content),
.gift-statistic-card--total .gift-statistic-icon {
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
  padding-block: var(--space-4);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
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
.gift-display-link {
  align-items: start;
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
  .gift-statistic-card :deep(.ant-card-body) {
    padding: var(--space-3);
  }
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
  .gift-preset-options {
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
