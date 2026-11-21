<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Skeleton as ASkeleton,
} from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { membershipPrice } from '../utils/format'
import type { MembershipStatistics } from '../types'

const props = defineProps<{
  statistics?: MembershipStatistics
  loading: boolean
  error: string
}>()
defineEmits<{ refresh: [] }>()
const { t, locale } = useI18n()
const count = (value: number) => value.toLocaleString(locale.value)
const updatedAt = computed(() =>
  props.statistics
    ? new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-GB', {
        timeZone: props.statistics.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(props.statistics.asOf)
    : '',
)
const summaries = computed(() => {
  const data = props.statistics
  if (!data) return []
  return [
    {
      id: 'members',
      label: t('membership.activeVipCount'),
      value: count(data.activeVipCount),
      details: [
        {
          label: t('membership.expiringSoonCount', {
            days: data.expiringWithinDays,
          }),
          value: count(data.expiringSoonCount),
        },
        {
          label: t('membership.expiredVipCount'),
          value: count(data.expiredVipCount),
        },
      ],
    },
    {
      id: 'receipts',
      label: t('membership.totalConfirmedCents'),
      value: membershipPrice(data.totalConfirmedCents),
      details: [
        {
          label: t('membership.paidUserCount'),
          value: count(data.paidUserCount),
        },
      ],
    },
    {
      id: 'month',
      label: t('membership.monthConfirmedCents'),
      value: membershipPrice(data.monthConfirmedCents),
      details: [
        {
          label: t('membership.todayConfirmedCents'),
          value: membershipPrice(data.todayConfirmedCents),
        },
      ],
    },
    {
      id: 'orders',
      label: t('membership.confirmedOrderCount'),
      value: count(data.confirmedOrderCount),
      details: [
        {
          label: t('membership.unusedCodeCount'),
          value: count(data.unusedCodeCount),
        },
        {
          label: t('membership.redeemedCodeCount'),
          value: count(data.redeemedCodeCount),
        },
        {
          label: t('membership.revokedCodeCount'),
          value: count(data.revokedCodeCount),
        },
      ],
    },
  ]
})
</script>
<template>
  <section
    class="membership-statistics panel"
    :aria-label="t('membership.statistics')"
    :aria-busy="loading"
  >
    <header class="statistics-header">
      <div>
        <h2>{{ t('membership.statistics') }}</h2>
        <p v-if="statistics && !error && !loading" class="statistics-updated">
          {{ t('membership.statisticsAsOf') }}
          <time :datetime="new Date(statistics.asOf).toISOString()">{{
            updatedAt
          }}</time>
        </p>
      </div>
      <a-button :loading="loading" @click="$emit('refresh')">
        <template #icon><reload-outlined aria-hidden="true" /></template>
        {{ t('common.refresh') }}
      </a-button>
    </header>
    <div v-if="loading" role="status" :aria-label="t('common.loading')">
      <a-skeleton active :paragraph="{ rows: 3 }" />
    </div>
    <a-alert v-else-if="error" type="error" :message="error" show-icon>
      <template #action>
        <a-button @click="$emit('refresh')">{{ t('common.retry') }}</a-button>
      </template>
    </a-alert>
    <template v-else-if="statistics">
      <div class="statistics-metrics">
        <div
          v-for="summary in summaries"
          :key="summary.id"
          class="statistics-metric"
          :data-metric="summary.id"
        >
          <dl>
            <dt>{{ summary.label }}</dt>
            <dd class="statistics-value">{{ summary.value }}</dd>
          </dl>
          <ul class="statistics-details">
            <li v-for="detail in summary.details" :key="detail.label">
              <span>{{ detail.label }}</span
              ><strong>{{ detail.value }}</strong>
            </li>
          </ul>
        </div>
      </div>
      <div class="statistics-distribution">
        <h3>{{ t('membership.packageReceipts') }}</h3>
        <ul class="statistics-packages">
          <li v-for="item in statistics.packages" :key="item.packageId">
            <span>{{ t(`membership.${item.packageId}`) }}</span>
            <strong>{{ membershipPrice(item.confirmedCents) }}</strong>
            <small>{{
              t('membership.orderCount', {
                count: count(item.confirmedOrderCount),
              })
            }}</small>
          </li>
        </ul>
      </div>
      <p class="statistics-basis">{{ t('membership.statisticsBasis') }}</p>
    </template>
  </section>
</template>
<style scoped>
.membership-statistics {
  min-width: 0;
}
.statistics-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}
.statistics-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.statistics-updated {
  margin: var(--space-1) 0 0;
  color: var(--color-muted);
  font-size: var(--text-small);
}
.statistics-updated time {
  display: inline-block;
  font-variant-numeric: tabular-nums;
}
.statistics-metrics,
.statistics-packages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-6);
}
.statistics-metric {
  min-width: 0;
}
.statistics-metric dl {
  margin: 0 0 var(--space-3);
}
.statistics-metric dt {
  color: var(--color-muted);
}
.statistics-value {
  margin: var(--space-2) 0 0;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.statistics-details,
.statistics-packages {
  margin: 0;
  padding: 0;
  list-style: none;
}
.statistics-details li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  margin-top: var(--space-1);
  color: var(--color-muted);
  font-size: var(--text-small);
}
.statistics-details strong {
  color: var(--color-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.statistics-distribution {
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.statistics-distribution h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-body);
  font-weight: 600;
}
.statistics-packages li {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
.statistics-packages strong {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.statistics-packages small,
.statistics-basis {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.statistics-basis {
  margin: var(--space-4) 0 0;
  line-height: 1.6;
}
@media (width <= 960px) {
  .statistics-metrics,
  .statistics-packages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .statistics-value {
    font-size: 24px;
  }
}
@media (width <= 360px) {
  .statistics-metrics,
  .statistics-packages {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
