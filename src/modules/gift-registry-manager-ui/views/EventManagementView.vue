<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  ConfigProvider as AConfigProvider,
  Popconfirm as APopconfirm,
  Space as ASpace,
  Tag as ATag,
  Tooltip as ATooltip,
} from 'ant-design-vue'
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  StopOutlined,
} from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import DataTable from '@/shared/components/DataTable.vue'
import ProQuery from '@/shared/components/ProQuery.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import type { QueryField } from '@/shared/api/types'
import { useResource } from '@/shared/composables/useResource'
import { useEventManagement } from '../hooks/useEventManagement'
import { useEventSettings } from '../hooks/useEventSettings'
import { useGiftEntitlements } from '../hooks/useGiftEntitlements'
import GiftQuotaNotice from '../components/GiftQuotaNotice.vue'
import { giftApi } from '../api'
import type { DisplaySettings, GiftEvent } from '../types'
import '../gift-registry.css'

defineOptions({ name: 'GiftEventManagement' })
const { t } = useI18n()
const router = useRouter()
const manager = useEventManagement()
const entitlement = useGiftEntitlements(ref(''))
watch(manager.rows, () => void entitlement.usage.load())
const EventFormModal = defineAsyncComponent(
  () => import('../components/EventFormModal.vue'),
)
const selectedEvent = ref<GiftEvent>()
const settings = useResource<DisplaySettings | undefined>(
  (signal) => giftApi.settings(selectedEvent.value!.id, { signal, silent: true }),
  undefined,
)
// Both form actions refresh this list with its existing filters and pagination.
const config = useEventSettings(selectedEvent, settings.data, ref([]), manager.load)
const queryFields = computed<QueryField[]>(() => [
  { key: 'name', label: 'gift.eventName' },
  {
    key: 'status',
    label: 'gift.eventStatus',
    type: 'select',
    options: [
      { value: 'ACTIVE', label: t('gift.active') },
      { value: 'CLOSED', label: t('gift.closed') },
    ],
  },
])
const columns = computed<TableColumnsType<GiftEvent>>(() => [
  { title: t('gift.eventName'), dataIndex: 'name', width: 200 },
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
  { title: t('gift.eventType'), dataIndex: 'eventType', width: 160 },
  { title: t('gift.eventDate'), dataIndex: 'eventDate', width: 140 },
  { title: t('gift.eventStatus'), dataIndex: 'status', width: 110 },
  {
    title: t('gift.description'),
    dataIndex: 'description',
    width: 400,
    ellipsis: { showTitle: false },
  },
  { title: t('common.actions'), dataIndex: 'actions', width: 180 },
])
function openEvent(event: GiftEvent) {
  void router.push({ name: 'gift-registry', query: { eventId: event.id } })
}
async function editEvent(event: GiftEvent) {
  if (!manager.canSave.value || manager.task.busy.value || config.task.busy.value) return
  await manager.task.run(async () => {
    selectedEvent.value = event
    await settings.load()
    if (settings.error.value) throw new Error(settings.error.value)
    // Editing retains the saved display title and photo in the shared preview.
    config.openEvent()
  })
}
</script>

<template>
  <a-config-provider>
    <page-container
      class="gift-management-page"
      :title="t('gift.manageEvents')"
    >
      <template #actions>
        <a-space wrap>
          <a-button
            v-if="manager.canSave.value"
            :disabled="
              manager.task.busy.value ||
              config.task.busy.value ||
              !entitlement.canCreateEvent.value
            "
            @click="config.openEvent(true)"
          >
            {{ t('gift.newEvent') }}
          </a-button>
          <a-button @click="router.push({ name: 'gift-registry' })">{{
            t('gift.title')
          }}</a-button>
        </a-space>
      </template>
      <gift-quota-notice
        class="gift-management-quota"
        :usage="entitlement.usage.data.value"
        :error="entitlement.usage.error.value || entitlement.membership.error"
        :loading="entitlement.usage.loading.value"
        :center-path="entitlement.membership.centerPath"
        :advanced="entitlement.membership.unlimited"
        @refresh="entitlement.refresh"
        @center="
          entitlement.membership.centerPath &&
          router.push(entitlement.membership.centerPath)
        "
      />
      <div class="panel stack gift-management-table">
        <pro-query
          :fields="queryFields"
          target="gift-registry-events"
          @search="manager.search"
        />
        <a-alert
          v-if="manager.error.value"
          type="error"
          :message="manager.error.value"
          show-icon
          ><template #action
            ><a-button @click="manager.load">{{
              t('common.retry')
            }}</a-button></template
          ></a-alert
        >
        <a-alert
          v-if="manager.task.error.value"
          type="error"
          :message="manager.task.error.value"
          show-icon
        />
        <data-table
          :rows="manager.rows.value"
          :columns="columns"
          :loading="manager.loading.value"
          :pagination="manager.pagination"
          @page="manager.page"
        >
          <template #cell="{ record, column }">
            <template v-if="column.dataIndex === 'eventType'">{{
              t(`gift.${record.eventType}`)
            }}</template>
            <a-tag
              v-else-if="column.dataIndex === 'status'"
              :color="record.status === 'ACTIVE' ? 'green' : 'default'"
              >{{
                t(record.status === 'ACTIVE' ? 'gift.active' : 'gift.closed')
              }}</a-tag
            >
            <text-ellipsis
              v-else-if="column.dataIndex === 'creatorName'"
              :text="record.creatorName || '--'"
            />
            <text-ellipsis
              v-else-if="column.dataIndex === 'description'"
              :text="record.description || '--'"
            />
            <div v-else-if="column.dataIndex === 'actions'">
              <a-space :size="4" wrap>
                <action-button
                  :label="t('gift.openBook')"
                  :icon="ReadOutlined"
                  @action="openEvent(record)"
                />
                <action-button
                  v-if="manager.canSave.value"
                  :label="t('gift.editEvent')"
                  :icon="EditOutlined"
                  :disabled="manager.task.busy.value || config.task.busy.value"
                  @action="editEvent(record)"
                />
                <action-button
                  v-if="manager.canSave.value && record.description.trim()"
                  :label="
                    t(
                      record.status === 'ACTIVE'
                        ? 'gift.closeEvent'
                        : 'gift.reopenEvent',
                    )
                  "
                  :icon="
                    record.status === 'ACTIVE'
                      ? StopOutlined
                      : PlayCircleOutlined
                  "
                  :confirm="
                    t(
                      record.status === 'ACTIVE'
                        ? 'gift.closeEventConfirm'
                        : 'gift.reopenEventConfirm',
                    )
                  "
                  :disabled="manager.task.busy.value"
                  @action="manager.changeStatus(record)"
                />
                <a-tooltip
                  v-if="manager.canDelete.value && record.status === 'CLOSED'"
                  :title="t('common.delete')"
                >
                  <a-popconfirm
                    :title="t('gift.deleteEventConfirm', { name: record.name })"
                    :ok-text="t('common.delete')"
                    :ok-button-props="{ danger: true }"
                    @confirm="manager.remove(record)"
                  >
                    <a-button
                      danger
                      type="text"
                      :aria-label="t('common.delete')"
                      :disabled="manager.task.busy.value"
                    >
                      <template #icon><delete-outlined /></template>
                    </a-button>
                  </a-popconfirm>
                </a-tooltip>
              </a-space>
              <p
                v-if="manager.canSave.value && !record.description.trim()"
                class="gift-management-hint muted"
              >
                {{ t('gift.completeEventHint') }}
              </p>
            </div>
            <template v-else>{{
              record[
                column.dataIndex as 'name' | 'eventDate' | 'description'
              ] || '--'
            }}</template>
          </template>
        </data-table>
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
    </page-container>
  </a-config-provider>
</template>

<style scoped>
/* Keep the 720px table inside its own scroller instead of expanding the panel's grid track. */
.gift-management-table {
  grid-template-columns: minmax(0, 1fr);
}
.gift-management-quota {
  margin-bottom: var(--space-4);
}
.gift-management-table > * {
  min-width: 0;
}
.gift-management-hint {
  margin: var(--space-2) 0 0;
  font-size: 0.75rem;
}
</style>
