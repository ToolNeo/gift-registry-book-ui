<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import {
  Button as AButton,
  FormItem as AFormItem,
  InputPassword as AInputPassword,
  Space as ASpace,
  Steps as ASteps,
  Input as AInput,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { usePasswordChange } from '@/modules/authentication-manager-ui/views/account/hooks/usePasswordChange'
import EmailCaptchaField from '@/modules/authentication-manager-ui/components/EmailCaptchaField.vue'
import FormModal from '@/shared/components/FormModal.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  completed: []
  'bind-email': []
}>()
const { t } = useI18n()
const state = usePasswordChange(() => emit('completed'))
const id = useId()
const label = computed(() =>
  t(`system.${['oldPassword', 'newPassword', 'confirmPassword'][state.step.value]}`),
)
const fieldName = computed(
  () => ['oldPassword', 'newPassword', 'confirmPassword'][state.step.value]!,
)
const inputId = computed(() => `${id}-${fieldName.value}`)
const value = computed(() => state.draft.value[fieldName.value as keyof typeof state.draft.value])
watch(
  () => props.open,
  (open) => {
    state.reset()
    if (open) void state.email.load()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => props.open && state.step.value === 2 && state.email.data.value?.bound,
  (ready) => {
    if (ready) void state.emailCode.captcha.load()
  },
)
function update(value: string) {
  if (state.busy.value) return
  if (state.step.value === 0) state.setOldPassword(value)
  else if (state.step.value === 1) state.setNewPassword(value)
  else state.setConfirmation(value)
}
function cancel() {
  if (state.writing.value) return
  state.reset()
  emit('update:open', false)
}
function proceed() {
  if (state.step.value === 2) void state.submit()
  else void state.next()
}
</script>
<template>
  <form-modal
    :open="open || state.writing.value"
    :title="t('system.changePassword')"
    :model="state.draft.value"
    :busy="state.busy.value"
    :error="state.error.value"
    :width="560"
    :closable="!state.writing.value"
    :keyboard="!state.writing.value"
    form-name="account-password"
    @cancel="cancel"
    @submit="proceed"
  >
    <a-steps
      :current="state.step.value"
      size="small"
      :items="[
        { title: t('accountPassword.verifyOld') },
        { title: t('accountPassword.setNew') },
        { title: t('accountPassword.confirmNew') },
      ]"
    />
    <a-form-item :key="fieldName" :label="label" :html-for="inputId" class="password-step-field">
      <a-input-password
        :id="inputId"
        :value="value"
        :disabled="state.busy.value"
        :autocomplete="state.step.value === 0 ? 'current-password' : 'new-password'"
        @update:value="update"
      />
    </a-form-item>
    <p v-if="state.step.value === 1" class="password-step-hint">
      {{ t('accountPassword.rule') }}
    </p>
    <template v-if="state.step.value === 2">
      <a-alert
        v-if="state.email.error.value"
        type="error"
        :message="state.email.error.value"
        show-icon
        ><template #action
          ><a-button @click="state.email.load">{{ t('common.retry') }}</a-button></template
        ></a-alert
      >
      <template v-else-if="state.email.data.value?.bound">
        <p>
          {{
            t('auth.emailCodeTarget', {
              email: state.email.data.value.maskedEmail,
            })
          }}
        </p>
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
              :disabled="state.busy.value || state.emailCode.remaining.value > 0"
              :loading="state.emailCode.busy.value"
              @click="state.sendCode"
              >{{
                state.emailCode.remaining.value
                  ? t('auth.resendAfter', {
                      seconds: state.emailCode.remaining.value,
                    })
                  : t(
                      state.emailCode.pending.value
                        ? 'auth.checkEmailDelivery'
                        : 'auth.sendEmailCode',
                    )
              }}</a-button
            >
          </div></a-form-item
        >
        <p v-if="state.emailCode.busy.value" role="status" class="muted">
          {{ t('auth.emailCodeSending') }}
        </p>
      </template>
      <a-alert
        v-else-if="!state.email.loading.value"
        type="info"
        :message="t('accountEmail.bindFirst')"
        show-icon
        ><template #action
          ><a-button :disabled="state.busy.value" @click="emit('bind-email')">{{
            t('accountEmail.bind')
          }}</a-button></template
        ></a-alert
      >
    </template>
    <template #footer>
      <a-space class="password-step-actions">
        <a-button :disabled="state.writing.value" @click="cancel">{{
          t('common.cancel')
        }}</a-button>
        <a-button v-if="state.step.value > 0" :disabled="state.busy.value" @click="state.back">{{
          t('accountPassword.previous')
        }}</a-button>
        <a-button
          type="primary"
          html-type="submit"
          :loading="state.busy.value"
          :disabled="state.busy.value"
          >{{ t(state.step.value === 2 ? 'common.save' : 'accountPassword.next') }}</a-button
        >
      </a-space>
    </template>
  </form-modal>
</template>
<style scoped>
.password-step-field {
  margin-top: var(--space-6);
}
.password-step-hint {
  color: var(--color-text-secondary);
}
.password-step-actions {
  display: flex;
  justify-content: flex-end;
}
.email-code-control {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
}
.email-code-control > .ant-input {
  min-width: 0;
}
@media (width <= 30rem) {
  .email-code-control {
    flex-wrap: wrap;
  }
}
</style>
