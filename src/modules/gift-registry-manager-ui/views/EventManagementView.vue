<script setup lang="ts">
import { computed } from 'vue'
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
import { useEventManagement } from '../hooks/useEventManagement'
import type { GiftEvent } from '../types'
import '../gift-registry.css'

defineOptions({ name: 'GiftEventManagement' })
const { t } = useI18n()
const router = useRouter()
const manager = useEventManagement()
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
  { title: t('gift.eventName'), dataIndex: 'name' },
  { title: t('gift.eventType'), dataIndex: 'eventType' },
  { title: t('gift.eventDate'), dataIndex: 'eventDate' },
  { title: t('gift.eventStatus'), dataIndex: 'status' },
  {
    title: t('gift.description'),
    dataIndex: 'description',
    width: 400,
    ellipsis: { showTitle: false },
  },
  { title: t('common.actions'), dataIndex: 'actions' },
])
function openEvent(event: GiftEvent, edit = false) {
  void router.push({
    name: 'gift-registry',
    query: { eventId: event.id, ...(edit ? { edit: '1' } : {}) },
  })
}
</script>

<template>
  <a-config-provider>
    <page-container
      class="gift-management-page"
      :title="t('gift.manageEvents')"
    >
      <template #actions
        ><a-button @click="router.push({ name: 'gift-registry' })">{{
          t('gift.title')
        }}</a-button></template
      >
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
                  :disabled="manager.task.busy.value"
                  @action="openEvent(record, true)"
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
    </page-container>
  </a-config-provider>
</template>

<style scoped>
/* Keep the 720px table inside its own scroller instead of expanding the panel's grid track. */
.gift-management-table {
  grid-template-columns: minmax(0, 1fr);
}
.gift-management-table > * {
  min-width: 0;
}
.gift-management-hint {
  margin: var(--space-2) 0 0;
  font-size: 0.75rem;
}
</style>
