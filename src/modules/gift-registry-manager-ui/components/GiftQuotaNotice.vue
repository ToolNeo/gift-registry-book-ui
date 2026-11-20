<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Space as ASpace,
} from 'ant-design-vue'
import type { GiftUsage } from '../types'
defineProps<{
  usage: GiftUsage | undefined
  error: string
  loading: boolean
  centerPath?: string
  advanced: boolean
}>()
const emit = defineEmits<{ refresh: []; center: [] }>()
const { t } = useI18n()
</script>
<template>
  <div class="gift-quota-notice">
    <a-alert v-if="error" type="error" :message="error" show-icon
      ><template #action
        ><a-button :loading="loading" @click="emit('refresh')">{{
          t('common.retry')
        }}</a-button></template
      ></a-alert
    >
    <template v-else-if="usage">
      <a-space wrap>
        <span>{{
          t('membership.activityQuota', {
            used: usage.ownedActivityCount,
            limit: usage.activityLimit ?? t('membership.unlimitedLimit'),
          })
        }}</span>
        <span v-if="usage.eventId">{{
          t('membership.entryQuota', {
            used: usage.entryCount,
            limit: usage.entryLimit ?? t('membership.unlimitedLimit'),
          })
        }}</span>
        <a-button v-if="centerPath" type="link" @click="emit('center')">{{
          t('membership.center')
        }}</a-button>
      </a-space>
      <p v-if="!usage.canCreateEvent">{{ t('membership.activityFull') }}</p>
      <p v-if="usage.eventId && !usage.canCreateEntry">
        {{ t('membership.entryFull') }}
      </p>
      <p v-if="!advanced" class="muted">{{ t('membership.advancedLocked') }}</p>
    </template>
    <span v-else class="muted">{{ t('membership.quotaLoading') }}</span>
  </div>
</template>
<style scoped>
.gift-quota-notice {
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
p {
  margin: var(--space-2) 0 0;
  line-height: 1.6;
}
</style>
