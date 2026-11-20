<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  FormItem as AFormItem,
  Input as AInput,
  Select as ASelect,
  Space as ASpace,
  Tabs as ATabs,
  TabPane as ATabPane,
  Tag as ATag,
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { ReloadOutlined, StopOutlined } from '@ant-design/icons-vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import FormModal from '@/shared/components/FormModal.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { usePermissions } from '@/shared/auth/provider'
import type { QueryField } from '@/shared/api/types'
import IssuedCodeModal from '../components/IssuedCodeModal.vue'
import { useMembershipManagement } from '../hooks/useMembershipManagement'
import { membershipDate, membershipPrice } from '../utils/format'
import type { AuthorizationCode, MembershipAccount } from '../types'

defineOptions({ name: 'MembershipManagement' })
const { t } = useI18n()
const permissions = usePermissions()
const manager = useMembershipManagement()
const { packages, accounts, codes, task, issueOpen, issued, notice, draft } =
  manager
const accountColumns = computed<
  TableColumnsType<MembershipAccount & { id: string }>
>(() => [
  { title: t('membership.username'), dataIndex: 'username' },
  { title: t('membership.name'), dataIndex: 'name' },
  { title: t('membership.status'), dataIndex: 'state' },
  { title: t('membership.expiresAt'), dataIndex: 'expiresAt', width: 190 },
])
const codeColumns = computed<TableColumnsType<AuthorizationCode>>(() => [
  { title: t('membership.username'), dataIndex: 'username', width: 140 },
  { title: t('membership.package'), dataIndex: 'packageId', width: 100 },
  { title: t('membership.price'), dataIndex: 'priceCents', width: 100 },
  { title: t('common.status'), dataIndex: 'status', width: 100 },
  {
    title: t('membership.paymentReference'),
    dataIndex: 'paymentReference',
    width: 190,
    ellipsis: true,
  },
  { title: t('membership.issueTime'), dataIndex: 'issuedAt', width: 190 },
  { title: t('membership.issuerName'), dataIndex: 'issuerName', width: 130 },
  { title: t('membership.redeemedAt'), dataIndex: 'redeemedAt', width: 190 },
  { title: t('common.actions'), dataIndex: 'actions', width: 160 },
])
const accountFields = computed<QueryField[]>(() => [
  { key: 'id', label: 'membership.userId' },
  { key: 'expiresAt', label: 'membership.expiresAt', type: 'date' },
])
const codeFields = computed<QueryField[]>(() => [
  { key: 'username', label: 'membership.username' },
  {
    key: 'status',
    label: 'common.status',
    type: 'select',
    options: ['UNUSED', 'REDEEMED', 'REVOKED'].map((value) => ({
      value,
      label: t(`membership.${value}`),
    })),
  },
  { key: 'issuedAt', label: 'membership.issueTime', type: 'date' },
])
const packageOptions = computed(() =>
  packages.data.value.map((item) => ({
    value: item.id,
    label: `${t(`membership.${item.id}`)} · ${membershipPrice(item.priceCents)} · ${t('membership.duration', { days: item.days })}`,
  })),
)
</script>
<template>
  <page-container
    :title="t('membership.management')"
    class="membership-management"
  >
    <template #actions
      ><a-button
        v-if="permissions.can('membership-admin:issue')"
        type="primary"
        @click="manager.openIssue"
        >{{ t('membership.issue') }}</a-button
      ></template
    >
    <div class="stack">
      <a-alert v-if="notice" type="info" :message="notice" show-icon />
      <a-alert
        v-if="packages.error.value"
        type="error"
        :message="packages.error.value"
        show-icon
        ><template #action
          ><a-button @click="packages.load">{{
            t('common.retry')
          }}</a-button></template
        ></a-alert
      >
      <a-alert
        v-if="task.error.value && !issueOpen"
        type="error"
        :message="task.error.value"
        show-icon
      />
      <a-tabs class="panel">
        <a-tab-pane key="codes" :tab="t('membership.codes')">
          <query-table
            :panel="false"
            :fields="codeFields"
            target="membership-codes"
            :rows="codes.data.value.data"
            :columns="codeColumns"
            :pagination="codes.pagination"
            :loading="codes.loading.value"
            :error="codes.error.value"
            @search="codes.search"
            @page="codes.page"
            @refresh="codes.load"
            @retry="codes.load"
          >
            <template #cell="{ record, column }">
              <template v-if="column.dataIndex === 'packageId'">{{
                t(`membership.${record.packageId}`)
              }}</template>
              <template v-else-if="column.dataIndex === 'priceCents'">{{
                membershipPrice(record.priceCents)
              }}</template>
              <a-tag
                v-else-if="column.dataIndex === 'status'"
                :color="record.status === 'REDEEMED' ? 'green' : 'default'"
                >{{ t(`membership.${record.status}`) }}</a-tag
              >
              <template
                v-else-if="
                  column.dataIndex === 'issuedAt' ||
                  column.dataIndex === 'redeemedAt'
                "
                >{{ membershipDate(record[column.dataIndex]) }}</template
              >
              <a-space
                v-else-if="
                  column.dataIndex === 'actions' && record.status === 'UNUSED'
                "
                wrap
              >
                <action-button
                  v-if="permissions.can('membership-admin:issue')"
                  :icon="ReloadOutlined"
                  :label="t('membership.reissue')"
                  :confirm="t('membership.reissueConfirm')"
                  :disabled="task.busy.value"
                  @action="manager.reissue(record)"
                />
                <action-button
                  v-if="permissions.can('membership-admin:revoke')"
                  :icon="StopOutlined"
                  :label="t('membership.revoke')"
                  :confirm="t('membership.revokeConfirm')"
                  :disabled="task.busy.value"
                  danger
                  @action="manager.revoke(record)"
                />
              </a-space>
              <template v-else-if="column.dataIndex !== 'actions'">{{
                record[
                  column.dataIndex as
                    | 'username'
                    | 'paymentReference'
                    | 'issuerName'
                ] || '--'
              }}</template>
            </template>
          </query-table>
        </a-tab-pane>
        <a-tab-pane key="accounts" :tab="t('membership.accounts')">
          <div class="stack">
            <a-alert
              type="info"
              :message="t('membership.accountsHint')"
              show-icon
            />
            <query-table
              :panel="false"
              :fields="accountFields"
              target="membership-accounts"
              :rows="accounts.data.value.data"
              :columns="accountColumns"
              :pagination="accounts.pagination"
              :loading="accounts.loading.value"
              :error="accounts.error.value"
              @search="accounts.search"
              @page="accounts.page"
              @refresh="accounts.load"
              @retry="accounts.load"
            >
              <template #cell="{ record, column }">
                <a-tag
                  v-if="column.dataIndex === 'state'"
                  :color="record.state === 'VIP' ? 'gold' : 'default'"
                  >{{ t(`membership.${record.state}`) }}</a-tag
                >
                <template v-else-if="column.dataIndex === 'expiresAt'">{{
                  membershipDate(record.expiresAt)
                }}</template>
                <template v-else>{{
                  record[column.dataIndex as 'username' | 'name'] || '--'
                }}</template>
              </template>
            </query-table>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
    <form-modal
      :open="issueOpen"
      :title="t('membership.issue')"
      :model="draft"
      :busy="task.busy.value"
      :error="task.error.value"
      :width="560"
      @cancel="issueOpen = false"
      @submit="manager.issue"
    >
      <a-alert
        type="info"
        :message="t('membership.issueHint')"
        show-icon
        class="issue-hint"
      />
      <a-form-item
        name="username"
        :label="t('membership.username')"
        :rules="[
          {
            required: true,
            whitespace: true,
            min: 5,
            max: 64,
            message: t('membership.usernameRequired'),
          },
        ]"
        ><a-input
          v-model:value="draft.username"
          :maxlength="64"
          autocomplete="off"
          :disabled="task.busy.value"
      /></a-form-item>
      <a-form-item
        name="packageId"
        :label="t('membership.package')"
        :rules="[{ required: true, message: t('membership.packageRequired') }]"
        ><a-select
          v-model:value="draft.packageId"
          :options="packageOptions"
          :loading="packages.loading.value"
          :disabled="task.busy.value"
      /></a-form-item>
      <a-form-item
        name="paymentReference"
        :label="t('membership.paymentReference')"
        :extra="t('membership.paymentHint')"
        :rules="[
          {
            required: true,
            whitespace: true,
            message: t('membership.paymentRequired'),
          },
        ]"
        ><a-input
          v-model:value="draft.paymentReference"
          :maxlength="128"
          autocomplete="off"
          :disabled="task.busy.value"
      /></a-form-item>
      <template #footer
        ><a-space class="issue-footer"
          ><a-button :disabled="task.busy.value" @click="issueOpen = false">{{
            t('common.cancel')
          }}</a-button
          ><a-button
            type="primary"
            html-type="submit"
            :loading="task.busy.value"
            :disabled="task.busy.value"
            >{{ t('membership.issue') }}</a-button
          ></a-space
        ></template
      >
    </form-modal>
    <issued-code-modal :result="issued" @close="issued = undefined" />
  </page-container>
</template>
<style scoped>
.membership-management,
.membership-management :deep(.ant-tabs-content),
.membership-management :deep(.ant-tabs-tabpane) {
  min-width: 0;
}
.issue-hint {
  margin-bottom: var(--space-4);
}
.issue-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
</style>
