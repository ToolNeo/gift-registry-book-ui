<script setup lang="ts">
import { watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
  Space as ASpace,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import EmailCaptchaField from '@/modules/authentication-manager-ui/components/EmailCaptchaField.vue'
import FormModal from '@/shared/components/FormModal.vue'
import { useEmailBinding } from '@/modules/authentication-manager-ui/views/account/hooks/useEmailBinding'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; completed: [] }>()
const { t } = useI18n()
const state = useEmailBinding(() => {
  emit('update:open', false)
  emit('completed')
})
watch(
  () => props.open,
  (open) => {
    state.reset()
    if (open) void state.emailCode.captcha.load()
  },
  { immediate: true, flush: 'sync' },
)
function cancel() {
  if (state.writing.value) return
  state.reset()
  emit('update:open', false)
}
</script>
<template>
  <form-modal
    :open="open || state.writing.value"
    :title="t('accountEmail.bind')"
    :model="state.form"
    :busy="state.busy.value"
    :error="state.error.value"
    :width="560"
    :closable="!state.writing.value"
    :keyboard="!state.writing.value"
    form-name="email-binding"
    @cancel="cancel"
    @submit="state.submit"
  >
    <a-alert type="info" :message="t('accountEmail.bindHint')" show-icon />
    <a-form-item
      name="oldPassword"
      :label="t('system.oldPassword')"
      :rules="[{ required: true, message: t('common.required') }]"
      ><a-input-password
        v-model:value="state.form.oldPassword"
        :disabled="state.writing.value"
        autocomplete="current-password"
    /></a-form-item>
    <a-form-item
      name="email"
      :label="t('system.email')"
      :rules="[
        {
          required: true,
          type: 'email',
          max: 255,
          message: t('auth.emailInvalid'),
        },
      ]"
      ><a-input
        v-model:value="state.form.email"
        :maxlength="255"
        :disabled="state.writing.value"
        autocomplete="email"
    /></a-form-item>
    <email-captcha-field
      v-model:answer="state.emailCode.captcha.answer.value"
      :image="state.emailCode.captcha.image.value.base64"
      :loading="state.emailCode.captcha.loading.value"
      :error="state.emailCode.captcha.error.value"
      :disabled="state.busy.value"
      @refresh="state.emailCode.captcha.load"
    />
    <a-form-item :label="t('auth.emailCode')"
      ><div class="email-code-control">
        <a-input
          v-model:value="state.emailCode.code.value"
          :aria-label="t('auth.emailCode')"
          :disabled="state.busy.value"
          :maxlength="6"
          autocomplete="one-time-code"
          inputmode="numeric"
        /><a-button
          :disabled="state.writing.value || state.emailCode.remaining.value > 0"
          :loading="state.emailCode.busy.value"
          @click="state.sendCode"
          >{{
            state.emailCode.remaining.value
              ? t('auth.resendAfter', {
                  seconds: state.emailCode.remaining.value,
                })
              : t(state.emailCode.pending.value ? 'auth.checkEmailDelivery' : 'auth.sendEmailCode')
          }}</a-button
        >
      </div></a-form-item
    >
    <p v-if="state.emailCode.busy.value" role="status" class="muted">
      {{ t('auth.emailCodeSending') }}
    </p>
    <p v-if="state.emailCode.maskedEmail.value" class="muted">
      {{ t('auth.emailCodeTarget', { email: state.emailCode.maskedEmail.value }) }}
    </p>
    <template #footer
      ><a-space class="email-binding-actions"
        ><a-button :disabled="state.writing.value" @click="cancel">{{
          t('common.cancel')
        }}</a-button
        ><a-button
          type="primary"
          html-type="submit"
          :loading="state.writing.value"
          :disabled="state.busy.value"
          >{{ t('accountEmail.bind') }}</a-button
        ></a-space
      ></template
    >
  </form-modal>
</template>
<style scoped>
.email-code-control {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}
.email-code-control > .ant-input {
  min-width: 0;
}
.email-binding-actions {
  display: flex;
  justify-content: flex-end;
}
@media (width <= 30rem) {
  .email-code-control {
    flex-wrap: wrap;
  }
}
</style>
