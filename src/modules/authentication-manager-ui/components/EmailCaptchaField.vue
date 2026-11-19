<script setup lang="ts">
import { useId } from 'vue'
import { Button as AButton, FormItem as AFormItem, Input as AInput } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  image: string
  answer: string
  loading: boolean
  disabled?: boolean
  error?: string
}>()
defineEmits<{ 'update:answer': [answer: string]; refresh: [] }>()
const { t } = useI18n()
const id = useId()
</script>
<template>
  <a-form-item
    :label="t('auth.imageCaptcha')"
    :html-for="id"
    :help="error"
    :validate-status="error ? 'error' : undefined"
  >
    <div class="email-captcha-control">
      <a-input
        :id="id"
        :value="answer"
        :maxlength="16"
        :disabled="disabled || loading"
        autocomplete="off"
        @update:value="$emit('update:answer', $event)"
      />
      <a-button
        class="email-captcha-refresh"
        :aria-label="t('auth.refreshCaptcha')"
        :aria-busy="loading"
        :disabled="disabled || loading"
        @click="$emit('refresh')"
      >
        <img v-if="image" :src="image" :alt="t('auth.imageCaptcha')" width="160" height="40" />
        <span v-else>{{ t(loading ? 'common.loading' : 'auth.refreshCaptcha') }}</span>
      </a-button>
    </div>
  </a-form-item>
</template>
<style scoped>
.email-captcha-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.email-captcha-control > .ant-input {
  min-width: 0;
}
.email-captcha-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 162px;
  height: 42px;
  padding: 0;
  overflow: hidden;
}
.email-captcha-refresh img {
  display: block;
}
</style>
