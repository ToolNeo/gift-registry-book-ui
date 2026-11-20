<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Card as ACard,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Space as ASpace,
  Tag as ATag,
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import { usePermissions } from '@/shared/auth/provider'
import PackageCards from '../components/PackageCards.vue'
import { useMembershipCenter } from '../hooks/useMembershipCenter'
import { membershipDate, membershipPrice } from '../utils/format'
import type { MembershipHistory } from '../types'

defineOptions({ name: 'MembershipCenter' })
const { t } = useI18n()
const permissions = usePermissions()
const center = useMembershipCenter()
const { membership, history, usage, task, draft, refreshWarning } = center
const state = computed(() =>
  membership.status?.state === 'EXEMPT'
    ? 'EXEMPT'
    : membership.unlimited
      ? 'VIP'
      : 'FREE',
)
const columns = computed<TableColumnsType<MembershipHistory>>(() => [
  { title: t('membership.package'), dataIndex: 'packageId', width: 110 },
  { title: t('membership.price'), dataIndex: 'priceCents', width: 110 },
  { title: t('membership.days'), dataIndex: 'days', width: 90 },
  { title: t('membership.redeemedAt'), dataIndex: 'redeemedAt', width: 190 },
  {
    title: t('membership.beforeExpiresAt'),
    dataIndex: 'beforeExpiresAt',
    width: 190,
  },
  {
    title: t('membership.afterExpiresAt'),
    dataIndex: 'afterExpiresAt',
    width: 190,
  },
])
</script>
<template>
  <page-container :title="t('membership.center')" class="membership-page">
    <template #actions
      ><a-button :loading="membership.loading" @click="center.refresh">{{
        t('common.refresh')
      }}</a-button></template
    >
    <div class="stack">
      <load-state
        :loading="membership.loading && !membership.status"
        :error="membership.error"
        @retry="center.refresh"
      >
        <a-card :title="t('membership.status')">
          <div class="membership-summary">
            <a-tag :color="membership.unlimited ? 'gold' : 'default'">{{
              t(`membership.${state}`)
            }}</a-tag>
            <span v-if="state === 'VIP'"
              >{{ t('membership.expiresAt') }}：{{
                membershipDate(membership.status?.expiresAt)
              }}</span
            >
            <span v-else-if="state === 'EXEMPT'">{{
              t('membership.exemptHint')
            }}</span>
            <span v-else>{{ t('membership.freeHint') }}</span>
          </div>
          <p v-if="usage.data.value" class="membership-usage">
            {{
              t('membership.activityQuota', {
                used: usage.data.value.ownedActivityCount,
                limit:
                  usage.data.value.activityLimit ??
                  t('membership.unlimitedLimit'),
              })
            }}
          </p>
          <a-alert
            v-if="usage.error.value"
            :message="usage.error.value"
            type="error"
            show-icon
          />
          <p class="muted">{{ t('membership.expiryHint') }}</p>
        </a-card>
      </load-state>
      <a-card :title="t('membership.packages')">
        <div class="stack">
          <package-cards :packages="membership.packages" />
          <p class="muted">{{ t('membership.packageHint') }}</p>
          <a-alert
            type="info"
            :message="t('membership.offlineHint')"
            show-icon
          />
          <p>{{ t('membership.benefits') }}</p>
        </div>
      </a-card>
      <a-card
        v-if="permissions.can('membership:redeem')"
        :title="t('membership.redeem')"
      >
        <a-form
          name="membership-redemption"
          :model="draft"
          layout="vertical"
          @finish="center.redeem"
        >
          <a-form-item
            name="code"
            :label="t('membership.code')"
            :rules="[
              {
                required: true,
                whitespace: true,
                message: t('membership.codeRequired'),
              },
            ]"
          >
            <a-input
              v-model:value="draft.code"
              :maxlength="128"
              :placeholder="t('membership.codePlaceholder')"
              autocomplete="off"
              :disabled="task.busy.value"
            />
          </a-form-item>
          <a-alert
            v-if="task.error.value"
            :message="task.error.value"
            type="error"
            show-icon
            class="membership-form-error"
          />
          <a-space wrap
            ><a-button
              type="primary"
              html-type="submit"
              :loading="task.busy.value"
              :disabled="task.busy.value"
              >{{ t('membership.redeem') }}</a-button
            ></a-space
          >
        </a-form>
        <a-alert
          v-if="refreshWarning"
          :message="refreshWarning"
          type="warning"
          show-icon
        />
      </a-card>
      <a-card :title="t('membership.history')">
        <query-table
          :panel="false"
          :rows="history.data.value.data"
          :columns="columns"
          :pagination="history.pagination"
          :loading="history.loading.value"
          :error="history.error.value"
          @refresh="history.load"
          @retry="history.load"
          @page="history.page"
        >
          <template #cell="{ record, column }">
            <template v-if="column.dataIndex === 'packageId'">{{
              t(`membership.${record.packageId}`)
            }}</template>
            <template v-else-if="column.dataIndex === 'priceCents'">{{
              membershipPrice(record.priceCents)
            }}</template>
            <template v-else-if="column.dataIndex === 'days'">{{
              record.days
            }}</template>
            <template v-else>{{
              membershipDate(
                record[
                  column.dataIndex as
                    | 'redeemedAt'
                    | 'beforeExpiresAt'
                    | 'afterExpiresAt'
                ],
              )
            }}</template>
          </template>
        </query-table>
      </a-card>
      <a-alert type="info" :message="t('membership.fileLimits')" show-icon />
    </div>
  </page-container>
</template>
<style scoped>
.membership-page,
.membership-page :deep(.ant-card-body) {
  min-width: 0;
}
.membership-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
p {
  margin: 0;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.membership-usage,
.membership-summary + p,
.membership-form-error {
  margin-bottom: var(--space-3);
}
.membership-summary {
  margin-bottom: var(--space-3);
}
</style>
