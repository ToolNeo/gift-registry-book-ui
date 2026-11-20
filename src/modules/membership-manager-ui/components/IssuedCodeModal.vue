<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Input as AInput,
  Modal as AModal,
  Space as ASpace,
} from 'ant-design-vue'
import { copyText } from '@/shared/utils/feedback'
import type { IssueResult } from '../types'
defineProps<{
  result: IssueResult | undefined
  deliveryError: string
  deliveryLoading: boolean
}>()
const emit = defineEmits<{ close: []; refresh: [] }>()
const { t } = useI18n()
</script>
<template>
  <a-modal
    :open="!!result?.code"
    :title="t('membership.issuedTitle')"
    :footer="null"
    :mask-closable="false"
    :destroy-on-close="true"
    @cancel="emit('close')"
  >
    <div v-if="result?.code" class="stack">
      <a-alert type="warning" :message="t('membership.onceHint')" show-icon />
      <p>{{ t('membership.username') }}：{{ result.authorization.username }}</p>
      <p>
        {{ t('membership.recipientEmail') }}：{{
          result.authorization.recipientEmail || '--'
        }}
      </p>
      <a-alert
        :type="
          result.authorization.deliveryStatus === 'SENT'
            ? 'success'
            : result.authorization.deliveryStatus === 'FAILED'
              ? 'error'
              : 'info'
        "
        :message="
          t(
            `membership.delivery${result.authorization.deliveryStatus || 'NOT_SENT'}`,
          )
        "
        :description="
          t(
            `membership.deliveryHint${result.authorization.deliveryStatus || 'NOT_SENT'}`,
          )
        "
        show-icon
      />
      <a-alert
        v-if="deliveryError"
        type="warning"
        :message="deliveryError"
        show-icon
      >
        <template #action
          ><a-button :loading="deliveryLoading" @click="emit('refresh')">{{
            t('common.retry')
          }}</a-button></template
        >
      </a-alert>
      <a-input
        :value="result.code"
        :aria-label="t('membership.code')"
        readonly
        autocomplete="off"
        class="issued-code"
      />
      <a-space wrap>
        <a-button type="primary" @click="copyText(result.code)">{{
          t('membership.copy')
        }}</a-button>
        <a-button @click="emit('close')">{{
          t('membership.closeCode')
        }}</a-button>
      </a-space>
    </div>
  </a-modal>
</template>
<style scoped>
.issued-code {
  font-family: monospace;
}
p {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
