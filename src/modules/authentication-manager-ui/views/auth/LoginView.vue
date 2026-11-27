<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from "vue";
import {
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
  Button as AButton,
  Alert as AAlert,
  Checkbox as ACheckbox,
  ConfigProvider as AConfigProvider,
} from "ant-design-vue";
import { GlobalOutlined } from "@ant-design/icons-vue";
import { useI18n } from "vue-i18n";
import { useLogin } from "@/modules/authentication-manager-ui/views/auth/hooks/useLogin";
import { useBranding } from "@/app/stores/branding";
import { useSettings } from "@/app/stores/settings";
import filingIcon from "@/modules/authentication-manager-ui/assets/filing/filing.png";

const AUTH_THEME = {
  token: {
    colorPrimary: "#1677ff",
    colorPrimaryHover: "#0e65e5",
    colorPrimaryActive: "#0958d9",
    colorLink: "#1677ff",
    colorLinkHover: "#0e65e5",
    colorLinkActive: "#0958d9",
    colorInfo: "#1677ff",
    colorSuccess: "#16a34a",
    colorText: "#0f172a",
    colorTextSecondary: "#526277",
    colorBorder: "#d8e2f0",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f4f7fc",
    controlHeight: 44,
    borderRadius: 8,
  },
} as const;

const branding = useBranding();
const { t, locale } = useI18n();
const settings = useSettings();
const view = ref<"login" | "register" | "reset">("login");
const hasSwitchedView = ref(false);
const usernameInput = ref<{ focus: () => void }>();
const RegistrationModal = defineAsyncComponent(
  () => import("./components/RegistrationModal.vue"),
);
const PasswordResetModal = defineAsyncComponent(
  () => import("./components/PasswordResetModal.vue"),
);
const {
  form,
  loading,
  busy,
  captchaLoading,
  canRetryPrepare,
  error,
  captcha,
  captchaEnabled,
  submit,
  prepare,
  clearError,
  refreshCaptcha,
} = useLogin();
const copyrightText = computed(() => branding.front.copyright?.trim() || "");
const recordNumber = computed(() => branding.front.recordNumber?.trim() || "");
const policeRecordNumber = computed(
  () => branding.front.policeRecordNumber?.trim() || "",
);
const hasFilings = computed(() =>
  Boolean(
    branding.front.showRecordNumber &&
      (recordNumber.value || policeRecordNumber.value),
  ),
);
const hasLegalInfo = computed(() =>
  Boolean(copyrightText.value || hasFilings.value),
);
const policeRecordUrl = computed(
  () =>
    `https://beian.mps.gov.cn/#/query/webSearch?code=${policeRecordNumber.value.replace(/[^0-9]/g, "")}`,
);
function switchView(next: "register" | "reset") {
  clearError();
  hasSwitchedView.value = true;
  view.value = next;
}
async function closed(open: boolean) {
  if (open) return;
  hasSwitchedView.value = true;
  view.value = "login";
  await nextTick();
  usernameInput.value?.focus();
}
</script>
<template>
  <a-config-provider :theme="AUTH_THEME">
    <main class="login-shell">
      <div class="login-visual" aria-hidden="true">
        <img :src="branding.images.background" alt="" />
      </div>
      <header class="login-topbar">
        <div class="login-brand">
          <img :src="branding.images.logo" :alt="branding.title" />
          <h1>{{ branding.title }}</h1>
        </div>
        <a-button
          type="text"
          class="login-language"
          :aria-label="t('common.language')"
          @click="settings.setLanguage(locale === 'zh' ? 'en' : 'zh')"
        >
          <global-outlined /><span>{{
            locale === "zh" ? "简体中文" : "English"
          }}</span>
        </a-button>
      </header>
      <div class="login-stage">
        <section
          class="login-panel"
          :class="{ 'login-panel-expanded': view !== 'login' }"
          :aria-labelledby="view === 'login' ? 'login-title' : undefined"
        >
          <div
            v-if="view === 'login'"
            class="login-content"
            :class="{ 'auth-view-enter': hasSwitchedView }"
          >
            <header class="login-heading">
              <h2 id="login-title">{{ t("auth.signInTitle") }}</h2>
              <p>{{ t("auth.signInDescription") }}</p>
            </header>
            <a-alert
              v-if="error"
              type="error"
              :message="error"
              show-icon
              class="login-error"
            />
            <a-form layout="vertical" :model="form" @finish="submit">
              <a-form-item
                name="username"
                :label="t('common.username')"
                :rules="[{ required: true, message: t('common.required') }]"
              >
                <a-input
                  ref="usernameInput"
                  v-model:value="form.username"
                  autocomplete="username"
                  :disabled="busy || loading"
                  autofocus
                />
              </a-form-item>
              <a-form-item
                name="password"
                :label="t('common.password')"
                :rules="[{ required: true, message: t('common.required') }]"
              >
                <a-input-password
                  v-model:value="form.password"
                  autocomplete="current-password"
                  :disabled="busy || loading"
                />
              </a-form-item>
              <a-form-item
                v-if="captchaEnabled"
                name="verifyCode"
                :label="t('auth.captcha')"
                :rules="[{ required: true, message: t('common.required') }]"
              >
                <div class="captcha-control">
                  <a-input
                    v-model:value="form.verifyCode"
                    class="auth-code-input"
                    autocomplete="off"
                    :disabled="busy || loading"
                  />
                  <a-button
                    class="captcha-refresh"
                    type="text"
                    :title="t('auth.refreshCaptcha')"
                    :aria-label="t('common.refresh')"
                    :loading="captchaLoading"
                    :disabled="busy || loading || captchaLoading"
                    @click="refreshCaptcha"
                    ><img
                      v-if="captcha.base64 && !captchaLoading"
                      :src="captcha.base64"
                      :alt="t('auth.captcha')"
                      width="160"
                      height="40"
                    /><span
                      v-else-if="!captchaLoading"
                      class="captcha-fallback"
                      >{{ t("common.refresh") }}</span
                    ></a-button
                  >
                </div>
              </a-form-item>
              <div class="login-remember">
                <a-checkbox
                  v-model:checked="form.rememberMe"
                  :disabled="busy || loading"
                  >{{ t("auth.rememberMe") }}</a-checkbox
                >
                <a-button
                  type="link"
                  :disabled="busy || loading"
                  @click="switchView('reset')"
                  >{{ t("auth.forgotPassword") }}</a-button
                >
              </div>
              <a-button
                type="primary"
                html-type="submit"
                block
                class="login-submit"
                :loading="busy || loading"
                :disabled="loading"
                >{{ t("common.login") }}</a-button
              >
              <div class="login-registration">
                <a-button
                  type="link"
                  :disabled="busy || loading"
                  @click="switchView('register')"
                  >{{ t("auth.registerLink") }}</a-button
                >
              </div>
              <a-button
                v-if="canRetryPrepare && error"
                block
                class="retry-button"
                @click="prepare"
                >{{ t("common.retry") }}</a-button
              >
            </a-form>
          </div>
          <registration-modal
            v-else-if="view === 'register'"
            :class="{ 'auth-view-enter': hasSwitchedView }"
            open
            embedded
            @update:open="closed"
          />
          <password-reset-modal
            v-else
            :class="{ 'auth-view-enter': hasSwitchedView }"
            open
            embedded
            @update:open="closed"
          />
        </section>
      </div>
      <footer class="login-footer">
        <div v-if="hasLegalInfo" class="login-legal">
          <p v-if="copyrightText" class="login-copyright">
            {{ copyrightText }}
          </p>
          <div v-if="hasFilings" class="login-filings">
            <a
              v-if="recordNumber"
              class="filing-link"
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              >{{ recordNumber }}</a
            >
            <a
              v-if="policeRecordNumber"
              class="filing-link police-filing-link"
              :href="policeRecordUrl"
              target="_blank"
              rel="noopener noreferrer"
              ><img
                class="police-filing-icon"
                :src="filingIcon"
                alt=""
                aria-hidden="true"
              />{{ policeRecordNumber }}</a
            >
          </div>
        </div>
        <p v-else class="login-tagline">{{ t("auth.recordTagline") }}</p>
      </footer>
    </main>
  </a-config-provider>
</template>
<style scoped>
.login-shell {
  --color-primary: #1677ff;
  --color-primary-hover: #0e65e5;
  --color-primary-active: #0958d9;
  --color-text: #0f172a;
  --color-label: #334155;
  --color-muted: #526277;
  --color-border: #d8e2f0;
  --color-border-hover: #9ec2f7;
  --color-divider: #eaf0f7;
  --color-surface: #ffffff;
  --color-input: #f8fafd;
  --color-background: #f4f7fc;
  --auth-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --auth-font-ui:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 80px 1fr auto;
  min-height: 100dvh;
  color: var(--color-text);
  caret-color: var(--color-primary);
  scrollbar-color: rgb(82 98 119 / 32%) transparent;
  font-family: var(--auth-font-ui);
}
.login-shell ::selection {
  background: rgb(22 119 255 / 14%);
  color: var(--color-text);
}
.login-visual {
  position: fixed;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  background: var(--color-background);
  pointer-events: none;
}
.login-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.login-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
  padding: 0 48px;
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.login-brand img {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgb(22 119 255 / 18%));
}
.login-brand h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.1875rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.login-language {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  color: var(--color-label);
  background: rgb(255 255 255 / 80%);
  border: 1px solid rgb(15 23 42 / 8%);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.18s var(--auth-ease),
    border-color 0.18s var(--auth-ease),
    color 0.18s var(--auth-ease),
    box-shadow 0.18s var(--auth-ease);
}
.login-language:hover,
.login-language:focus-visible {
  color: var(--color-primary);
  background: #ffffff;
  border-color: rgb(22 119 255 / 26%);
  box-shadow: 0 4px 12px -4px rgb(15 35 66 / 14%);
}
.login-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  min-width: 0;
  padding: 16px 20px 28px;
}
.login-panel {
  width: min(456px, 100%);
  min-width: 0;
  padding: 36px 40px 24px;
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow:
    0 2px 8px -2px rgb(15 35 66 / 7%),
    0 22px 52px -14px rgb(15 35 66 / 14%);
}
.login-panel-expanded {
  width: min(520px, 100%);
  padding: 28px 36px 22px;
}
.auth-view-enter {
  animation: auth-view-fade 0.18s var(--auth-ease);
}
@keyframes auth-view-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.login-heading,
.login-panel :deep(.form-embedded-heading) {
  margin-bottom: 24px;
}
.login-heading h2,
.login-panel :deep(.form-embedded-heading h2) {
  margin: 0;
  color: var(--color-text);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
}
.login-heading p {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: 0.875rem;
  line-height: 1.5;
}
.login-panel-expanded :deep(.form-embedded-heading) {
  margin-bottom: 18px;
}
.login-panel-expanded :deep(.form-embedded-heading h2) {
  font-size: 1.375rem;
}
.login-panel :deep(.ant-form-item) {
  margin-bottom: 18px;
}
.login-panel-expanded :deep(.ant-form-item) {
  margin-bottom: 12px;
}
.login-panel :deep(.ant-form-item-label) {
  padding-bottom: 6px;
}
.login-panel :deep(.ant-form-item-label > label) {
  height: auto;
  color: var(--color-label);
  font-size: 0.84375rem;
  font-weight: 500;
  line-height: 20px;
}
.login-panel :deep(.ant-input),
.login-panel :deep(.ant-input-affix-wrapper),
.login-panel :deep(.ant-btn:not(.ant-btn-link)) {
  min-height: 44px;
  border-radius: 8px;
  font-size: 0.875rem;
}
.login-panel :deep(.ant-input),
.login-panel :deep(.ant-input-affix-wrapper) {
  background: var(--color-input);
  border-color: var(--color-border);
  transition:
    background-color 0.16s var(--auth-ease),
    border-color 0.16s var(--auth-ease),
    box-shadow 0.16s var(--auth-ease);
}
.login-panel :deep(.ant-input:hover),
.login-panel :deep(.ant-input-affix-wrapper:hover) {
  background: #ffffff;
  border-color: var(--color-border-hover);
}
.login-panel :deep(.ant-input:focus),
.login-panel :deep(.ant-input-affix-wrapper-focused) {
  background: #ffffff;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgb(22 119 255 / 14%);
}
.login-panel :deep(.ant-input:-webkit-autofill),
.login-panel :deep(.ant-input:-webkit-autofill:hover),
.login-panel :deep(.ant-input:-webkit-autofill:focus) {
  -webkit-text-fill-color: var(--color-text);
  box-shadow: 0 0 0 1000px var(--color-input) inset;
  transition: background-color 5000s ease-in-out 0s;
}
.login-panel :deep(.ant-input-affix-wrapper) {
  padding-block: 0;
}
.login-panel :deep(.ant-input-affix-wrapper > .ant-input) {
  min-height: 42px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}
.login-panel :deep(.auth-code-input),
.login-panel :deep(.email-code-control .ant-input),
.login-panel :deep(.email-code-control > .ant-btn) {
  font-variant-numeric: tabular-nums;
}
.login-panel :deep(.ant-btn-primary) {
  font-weight: 500;
  letter-spacing: 0.02em;
  box-shadow:
    0 1px 2px rgb(9 88 217 / 22%),
    0 6px 16px -4px rgb(22 119 255 / 34%);
  transition:
    background-color 0.16s var(--auth-ease),
    box-shadow 0.16s var(--auth-ease),
    transform 0.14s var(--auth-ease);
}
.login-panel :deep(.ant-btn-primary:not(:disabled):hover) {
  box-shadow:
    0 2px 4px rgb(9 88 217 / 26%),
    0 10px 22px -6px rgb(14 101 229 / 44%);
}
.login-panel :deep(.ant-btn-primary:not(:disabled):active) {
  transform: translateY(1px);
  box-shadow: 0 1px 2px rgb(9 88 217 / 20%);
}
.login-panel :deep(.ant-btn-link) {
  text-underline-offset: 3px;
}
.login-panel :deep(.ant-btn-link:not(:disabled):hover) {
  text-decoration: underline;
}
.login-error {
  margin-bottom: 18px;
  border-radius: 8px;
}
.login-remember {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 0 22px;
}
.login-remember > .ant-btn {
  height: auto;
  padding: 0;
  font-size: 0.84375rem;
}
.login-registration {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--color-divider);
}
.login-registration > .ant-btn {
  height: auto;
  padding: 2px 8px;
  font-weight: 500;
  line-height: 22px;
}
.retry-button {
  margin-top: 12px;
}
.captcha-control,
.login-panel :deep(.email-captcha-control) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.captcha-control > .ant-input {
  flex: 1;
  min-width: 0;
}
.captcha-refresh,
.login-panel :deep(.email-captcha-refresh) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 132px;
  width: 132px;
  max-width: 50%;
  height: 44px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-input);
  cursor: pointer;
  transition:
    border-color 0.16s var(--auth-ease),
    background-color 0.16s var(--auth-ease),
    box-shadow 0.16s var(--auth-ease);
}
.captcha-refresh:not(:disabled):hover,
.login-panel :deep(.email-captcha-refresh:not(:disabled):hover) {
  border-color: var(--color-border-hover);
  background: #ffffff;
}
.captcha-refresh:focus-visible,
.login-panel :deep(.email-captcha-refresh:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgb(22 119 255 / 14%);
}
.captcha-refresh img,
.login-panel :deep(.email-captcha-refresh img) {
  display: block;
  width: 100%;
  height: 40px;
  object-fit: contain;
}
.captcha-fallback {
  color: var(--color-muted);
  font-size: 0.75rem;
}
.login-panel :deep(.auth-pair) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
.login-panel :deep(.email-code-control) {
  gap: 10px;
  flex-wrap: nowrap;
}
.login-panel :deep(.email-code-control > .ant-btn) {
  flex: 0 0 132px;
  max-width: 50%;
  padding-inline: 8px;
  white-space: normal;
  line-height: 1.3;
}
.login-panel :deep(.email-code-status) {
  margin: -4px 0 12px;
  font-size: 0.75rem;
  line-height: 18px;
}
.login-panel :deep(.auth-password-rule) {
  margin: -2px 0 16px;
  font-size: 0.75rem;
  line-height: 18px;
}
.login-panel :deep(.auth-embedded-actions) {
  display: grid;
  gap: 14px;
}
.login-panel :deep(.auth-embedded-actions > .ant-btn-link) {
  height: auto;
  padding: 12px 0 0;
  border-top: 1px solid var(--color-divider);
  border-radius: 0;
  font-weight: 500;
  line-height: 22px;
}
.login-panel :deep(.form-embedded > .ant-alert) {
  margin-bottom: 16px;
  border-radius: 8px;
}
.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  padding: 20px 24px;
  color: var(--color-label);
  background: linear-gradient(
    to top,
    rgb(244 247 252 / 86%) 0%,
    rgb(244 247 252 / 0%) 100%
  );
  font-size: 0.75rem;
  line-height: 20px;
  text-align: center;
  overflow-wrap: anywhere;
}
.login-footer p {
  margin: 0;
}
.login-tagline {
  letter-spacing: 0.04em;
}
.login-legal,
.login-filings {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 16px;
}
.login-legal {
  max-width: 100%;
}
.filing-link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: inherit;
  border-radius: 4px;
  text-decoration: none;
  text-underline-offset: 3px;
  transition: color 0.16s var(--auth-ease);
}
.filing-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}
.filing-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  color: var(--color-primary);
}
.police-filing-link {
  gap: 4px;
}
.police-filing-icon {
  flex: none;
  width: 20px;
  height: 20px;
  object-fit: contain;
}
@media (prefers-reduced-motion: reduce) {
  .auth-view-enter {
    animation: none;
  }
  .login-language,
  .login-panel :deep(.ant-input),
  .login-panel :deep(.ant-input-affix-wrapper),
  .login-panel :deep(.ant-btn-primary),
  .captcha-refresh,
  .login-panel :deep(.email-captcha-refresh),
  .filing-link {
    transition: none;
  }
}
@media (width <= 48rem) {
  .login-shell {
    grid-template-rows: 76px 1fr auto;
  }
  .login-topbar {
    gap: 12px;
    padding: 0 24px;
  }
  .login-brand {
    gap: 9px;
  }
  .login-brand img {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .login-brand h1 {
    font-size: 1.0625rem;
  }
  .login-language {
    min-height: 44px;
    height: 44px;
    padding: 0 14px;
    font-size: 0.8125rem;
  }
  .login-stage {
    padding: 12px 20px 24px;
  }
  .login-panel,
  .login-panel-expanded {
    padding: 28px 24px 20px;
    border-radius: 14px;
  }
  .login-heading h2 {
    font-size: 1.375rem;
  }
  .login-remember {
    margin: 6px 0 14px;
  }
  .login-remember :deep(.ant-checkbox-wrapper),
  .login-remember > .ant-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .login-registration {
    margin-top: 16px;
    padding-top: 8px;
  }
  .login-registration > .ant-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 12px;
  }
  .login-panel :deep(.auth-embedded-actions > .ant-btn-link) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 8px 0 0;
  }
  .login-panel :deep(.auth-pair) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .login-footer {
    padding: 18px 20px 20px;
  }
}
@media (width <= 22rem) {
  .login-topbar {
    padding-inline: 20px;
  }
  .login-panel {
    padding-inline: 20px;
  }
  .login-brand h1 {
    font-size: 1rem;
  }
  .captcha-refresh,
  .login-panel :deep(.email-captcha-refresh),
  .login-panel :deep(.email-code-control > .ant-btn) {
    flex-basis: 112px;
    width: 112px;
  }
}
</style>
