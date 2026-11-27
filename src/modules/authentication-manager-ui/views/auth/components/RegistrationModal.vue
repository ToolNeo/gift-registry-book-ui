<script setup lang="ts">
import { watch } from "vue";
import {
  Button as AButton,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
} from "ant-design-vue";
import { useI18n } from "vue-i18n";
import EmailCaptchaField from "@/modules/authentication-manager-ui/components/EmailCaptchaField.vue";
import FormModal from "@/shared/components/FormModal.vue";
import { useRegistration } from "@/modules/authentication-manager-ui/views/auth/hooks/useRegistration";
const props = defineProps<{ open: boolean; embedded?: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const { t } = useI18n();
const state = useRegistration(() => emit("update:open", false));
watch(
  () => props.open,
  (open) => {
    state.reset();
    if (open) void state.emailCode.captcha.load();
  },
  { immediate: true, flush: "sync" },
);
function cancel() {
  if (state.writing.value) return;
  state.reset();
  emit("update:open", false);
}
</script>
<template>
  <form-modal
    :open="open || state.writing.value"
    :title="t('auth.register')"
    :model="state.form"
    :busy="state.busy.value"
    :error="state.error.value"
    :width="560"
    :closable="!state.writing.value"
    :keyboard="!state.writing.value"
    :embedded="embedded"
    form-name="registration"
    @cancel="cancel"
    @submit="state.submit"
  >
    <div :class="{ 'auth-pair': embedded }">
      <a-form-item
        name="username"
        :label="t('common.username')"
        :help="
          state.usernameError.value ||
          (embedded ? undefined : t('auth.usernameRule'))
        "
        :validate-status="
          state.usernameError.value
            ? 'error'
            : state.checkingUsername.value
              ? 'validating'
              : undefined
        "
        :rules="[
          {
            required: true,
            whitespace: true,
            min: 5,
            max: 64,
            transform: (value: string) => value?.trim(),
            message: t('auth.usernameRule'),
          },
        ]"
      >
        <a-input
          v-model:value="state.form.username"
          :maxlength="64"
          :disabled="state.writing.value"
          autocomplete="username"
          @blur="state.checkUsername"
        />
      </a-form-item>
      <a-form-item
        name="name"
        :label="t('system.name')"
        :rules="[
          {
            required: true,
            whitespace: true,
            max: 128,
            message: t('common.required'),
          },
        ]"
      >
        <a-input
          v-model:value="state.form.name"
          :maxlength="128"
          :disabled="state.writing.value"
          autocomplete="name"
        />
      </a-form-item>
    </div>
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
    >
      <a-input
        v-model:value="state.form.email"
        :maxlength="255"
        :disabled="state.writing.value"
        autocomplete="email"
      />
    </a-form-item>
    <email-captcha-field
      v-model:answer="state.emailCode.captcha.answer.value"
      :image="state.emailCode.captcha.image.value.base64"
      :loading="state.emailCode.captcha.loading.value"
      :error="state.emailCode.captcha.error.value"
      :disabled="state.busy.value"
      @refresh="state.emailCode.captcha.load"
    />
    <a-form-item :label="t('auth.emailCode')">
      <div class="email-code-control">
        <a-input
          v-model:value="state.emailCode.code.value"
          :aria-label="t('auth.emailCode')"
          :disabled="state.busy.value"
          :maxlength="6"
          autocomplete="one-time-code"
          inputmode="numeric"
        />
        <a-button
          :disabled="state.writing.value || state.emailCode.remaining.value > 0"
          :loading="state.emailCode.busy.value"
          @click="state.sendCode"
        >
          {{
            state.emailCode.remaining.value
              ? t("auth.resendAfter", {
                  seconds: state.emailCode.remaining.value,
                })
              : t(
                  state.emailCode.pending.value
                    ? "auth.checkEmailDelivery"
                    : "auth.sendEmailCode",
                )
          }}
        </a-button>
      </div>
    </a-form-item>
    <p
      v-if="state.emailCode.busy.value"
      role="status"
      class="muted email-code-status"
    >
      {{ t("auth.emailCodeSending") }}
    </p>
    <p v-if="state.emailCode.maskedEmail.value" class="muted email-code-status">
      {{
        t("auth.emailCodeTarget", { email: state.emailCode.maskedEmail.value })
      }}
    </p>
    <div :class="{ 'auth-pair': embedded }">
      <a-form-item
        name="password"
        :label="t('common.password')"
        :rules="[{ required: true, message: t('common.required') }]"
      >
        <a-input-password
          v-model:value="state.form.password"
          :disabled="state.writing.value"
          :maxlength="128"
          autocomplete="new-password"
        />
      </a-form-item>
      <a-form-item
        name="confirmPassword"
        :label="t('system.confirmPassword')"
        :rules="[{ required: true, message: t('common.required') }]"
      >
        <a-input-password
          v-model:value="state.form.confirmPassword"
          :disabled="state.writing.value"
          :maxlength="128"
          autocomplete="new-password"
        />
      </a-form-item>
    </div>
    <p class="muted auth-password-rule">{{ t("accountPassword.rule") }}</p>
    <template #footer>
      <div :class="embedded ? 'auth-embedded-actions' : 'registration-actions'">
        <a-button
          v-if="!embedded"
          :disabled="state.writing.value"
          @click="cancel"
          >{{ t("common.cancel") }}</a-button
        >
        <a-button
          type="primary"
          html-type="submit"
          :loading="state.writing.value"
          :disabled="state.busy.value"
          >{{ t("auth.register") }}</a-button
        >
        <a-button
          v-if="embedded"
          type="link"
          :disabled="state.writing.value"
          @click="cancel"
          >{{ t("auth.backToLogin") }}</a-button
        >
      </div>
    </template>
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
.registration-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
@media (width <= 30rem) {
  .email-code-control {
    flex-wrap: wrap;
  }
}
</style>
