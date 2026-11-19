<script setup lang="ts">
defineOptions({ name: 'AccountView' })
import {
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Button as AButton,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useAccount } from '@/modules/authentication-manager-ui/views/account/hooks/useAccount'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import PageContainer from '@/shared/components/PageContainer.vue'
import LoadState from '@/shared/components/LoadState.vue'
import PasswordChangeModal from '@/modules/authentication-manager-ui/views/account/components/PasswordChangeModal.vue'
import ProfileEditor from '@/modules/authentication-manager-ui/views/account/components/ProfileEditor.vue'
import EmailBindingModal from '@/modules/authentication-manager-ui/views/account/components/EmailBindingModal.vue'
const { t } = useI18n(),
  state = useAccount()
function bindEmail() {
  state.changing.value = undefined
  state.binding.value = true
}
</script>
<template>
  <page-container :title="t('layout.profile')"
    ><div class="panel">
      <a-alert
        v-if="state.task.error.value"
        type="error"
        :message="state.task.error.value"
      /><load-state
        :loading="state.resource.loading.value"
        :error="state.resource.error.value"
        @retry="state.resource.load"
        ><a-descriptions bordered :column="1"
          ><a-descriptions-item
            v-for="key in [
              'username',
              'name',
              'telephone',
              'email',
              'roleList',
              'orgList',
              'positions',
            ]"
            :key="key"
            :label="t(`system.${key}`)"
            ><template v-if="key === 'email'">{{
              state.email.data.value?.bound
                ? state.email.data.value.maskedEmail
                : t('accountEmail.unbound')
            }}</template
            ><template v-else>{{
              displayValue(state.profile.value[key])
            }}</template></a-descriptions-item
          ></a-descriptions
        ><a-space class="tree-toolbar"
          ><a-button type="primary" @click="state.editing.value = { ...state.profile.value }">{{
            t('common.edit')
          }}</a-button
          ><a-button
            v-if="state.email.data.value && !state.email.data.value.bound"
            @click="state.binding.value = true"
            >{{ t('accountEmail.bind') }}</a-button
          ><a-button
            :disabled="state.email.loading.value || !!state.email.error.value"
            @click="state.changing.value = {}"
            >{{ t('system.changePassword') }}</a-button
          ></a-space
        ></load-state
      >
      <a-alert
        v-if="state.email.error.value"
        type="error"
        :message="state.email.error.value"
        show-icon
        ><template #action
          ><a-button @click="state.email.load">{{ t('common.retry') }}</a-button></template
        ></a-alert
      >
    </div>
    <profile-editor
      v-model="state.editing.value"
      :busy="state.task.busy.value"
      :error="state.task.error.value"
      @save="state.save" />
    <password-change-modal
      :open="!!state.changing.value"
      @update:open="
        (open) => {
          if (!open) state.changing.value = undefined
        }
      "
      @completed="state.passwordChanged"
      @bind-email="bindEmail" /><email-binding-modal
      :open="state.binding.value"
      @update:open="state.binding.value = $event"
      @completed="state.emailBound"
  /></page-container>
</template>
