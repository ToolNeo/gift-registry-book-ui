<script setup lang="ts">
import { computed, useId, type PropType } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputNumber as AInputNumber,
  Radio as ARadio,
  RadioGroup as ARadioGroup,
  Space as ASpace,
  Tag as ATag,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { EntryDraft, GiftEntry } from '../types'
import { formatAmount } from '../utils/money'

const props = defineProps({
  model: { type: Object as PropType<EntryDraft>, required: true },
  editing: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  uncertain: { type: Boolean, default: false },
  error: { type: String, default: '' },
  duplicates: { type: Array as PropType<GiftEntry[]>, default: () => [] },
  confirmDuplicates: { type: Boolean, default: false },
})
const emit = defineEmits<{ submit: [confirmed: boolean]; savedFocus: [] }>()
const { t } = useI18n()
const formName = `gift-entry-${useId()}`
const model = computed(() => props.model)
const fieldsDisabled = computed(
  () => props.disabled || props.busy || props.uncertain,
)
</script>

<template>
  <a-form
    class="gift-entry-form"
    :name="formName"
    :model="model"
    layout="vertical"
    :disabled="fieldsDisabled"
    @finish="emit('submit', false)"
  >
    <div class="entry-form-fields">
      <a-form-item
        :label="t('gift.entryName')"
        name="name"
        :rules="[
          { required: true, whitespace: true, message: t('gift.nameRequired') },
        ]"
      >
        <a-input
          v-model:value="model.name"
          :maxlength="100"
          autocomplete="off"
          data-testid="entry-name"
        />
      </a-form-item>
      <a-form-item
        :label="t('gift.amount')"
        name="amount"
        :rules="[{ required: true, message: t('gift.amountInvalid') }]"
      >
        <a-input
          v-model:value="model.amount"
          inputmode="decimal"
          autocomplete="off"
          data-testid="entry-amount"
        />
      </a-form-item>
      <a-form-item :label="t('gift.payment')" name="paymentMethod">
        <a-radio-group v-model:value="model.paymentMethod">
          <a-radio value="CASH">{{ t('gift.CASH') }}</a-radio>
          <a-radio value="WECHAT">{{ t('gift.WECHAT') }}</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item
        :label="t('gift.attendeeCount')"
        name="attendeeCount"
        :extra="t('gift.attendeeHint')"
      >
        <a-input-number
          :value="model.attendeeCount ?? undefined"
          :min="0"
          :max="2147483647"
          style="width: 100%"
          data-testid="entry-attendees"
          @update:value="
            (value) =>
              (model.attendeeCount = typeof value === 'number' ? value : null)
          "
        />
      </a-form-item>
    </div>
    <a-form-item :label="t('gift.remark')" name="remark">
      <a-input v-model:value="model.remark" :maxlength="1000" />
    </a-form-item>
    <a-form-item
      v-if="editing"
      :label="t('gift.reason')"
      name="reason"
      :rules="[
        { required: true, whitespace: true, message: t('gift.reasonRequired') },
      ]"
    >
      <a-input v-model:value="model.reason" :maxlength="500" />
    </a-form-item>
    <a-alert
      v-if="duplicates.length"
      type="warning"
      :message="t('gift.duplicateTitle')"
      show-icon
      class="entry-warning"
    >
      <template #description>
        <p>{{ t('gift.duplicateHint') }}</p>
        <ul class="duplicate-list">
          <li v-for="entry in duplicates" :key="entry.id">
            #{{ entry.seq }} {{ entry.name }} ·
            {{ formatAmount(entry.amountCents) }} {{ t('gift.amountYuan') }} ·
            {{ t(`gift.${entry.paymentMethod}`) }} ·
            {{ t('gift.attendeeCount') }}
            {{ entry.attendeeCount ?? t('gift.unregistered') }} ·
            {{ dayjs(entry.createdAt).format('MM-DD HH:mm:ss') }}
            <a-tag :color="entry.status === 'VOID' ? 'default' : 'green'">{{
              t(`gift.${entry.status}`)
            }}</a-tag>
          </li>
        </ul>
      </template>
    </a-alert>
    <a-alert
      v-if="uncertain"
      type="warning"
      :message="t('gift.uncertain')"
      show-icon
      class="entry-warning"
    />
    <a-alert
      v-if="error"
      type="error"
      :message="error"
      show-icon
      class="entry-warning"
    />
    <a-space>
      <a-button
        v-if="confirmDuplicates"
        type="primary"
        :disabled="disabled || busy"
        :loading="busy"
        @click="emit('submit', true)"
        >{{ t('gift.continueSave') }}</a-button
      >
      <a-button
        v-else
        type="primary"
        html-type="submit"
        :disabled="disabled || busy"
        :loading="busy"
        >{{
          t(
            uncertain
              ? 'gift.retryEntry'
              : editing
                ? 'common.save'
                : 'gift.saveEntry',
          )
        }}</a-button
      >
    </a-space>
  </a-form>
</template>

<style scoped>
.entry-form-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}
.entry-warning {
  margin-bottom: var(--space-4);
}
.duplicate-list {
  padding-left: var(--space-4);
  max-height: 200px;
  overflow: auto;
}
.duplicate-list li {
  margin-bottom: var(--space-2);
  overflow-wrap: anywhere;
}
@media (width <= 1100px) {
  .entry-form-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 600px) {
  .entry-form-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
