<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button as AButton,
  DatePicker as ADatePicker,
  FormItem as AFormItem,
  Input as AInput,
  Modal as AModal,
  Radio as ARadio,
  RadioGroup as ARadioGroup,
  Select as ASelect,
  Textarea as ATextarea,
} from 'ant-design-vue'
import FormModal from '@/shared/components/FormModal.vue'
import type { EventDraft } from '../hooks/useEventSettings'
import type { DisplaySnapshot } from '../types'
import { eventPresets } from '../themes'

const props = defineProps<{
  open: boolean
  creating: boolean
  model: EventDraft
  busy: boolean
  error: string
  preview: DisplaySnapshot
}>()
const emit = defineEmits<{ submit: []; cancel: [] }>()
const { t } = useI18n()
const model = computed(() => props.model)
const DisplayBook = defineAsyncComponent(() => import('./DisplayBook.vue'))
const previewOpen = ref(false)
watch(
  () => props.open,
  (open) => {
    if (!open) previewOpen.value = false
  },
)
</script>

<template>
  <form-modal
    wrap-class-name="gift-management-modal"
    :open="open"
    :title="t(creating ? 'gift.newEvent' : 'gift.editEvent')"
    :model="model"
    :busy="busy"
    :error="error"
    :width="1000"
    @cancel="emit('cancel')"
    @submit="emit('submit')"
  >
    <a-form-item
      name="eventType"
      :label="t('gift.eventType')"
      :rules="[{ required: true, message: t('gift.typeRequired') }]"
    >
      <a-radio-group
        v-model:value="model.eventType"
        class="gift-preset-options"
      >
        <a-radio
          v-for="preset in eventPresets"
          :key="preset.value"
          :value="preset.value"
          class="gift-preset-card"
          :class="`gift-preset-card--${preset.value.toLowerCase()}`"
        >
          <span class="gift-preset-swatch" aria-hidden="true">{{
            preset.ornament || '✾'
          }}</span>
          <strong>{{ t(`gift.${preset.value}`) }}</strong>
          <span class="gift-preset-hint">{{
            t(`gift.preset_${preset.value}`)
          }}</span>
        </a-radio>
      </a-radio-group>
    </a-form-item>
    <a-form-item
      name="name"
      :label="t('gift.eventName')"
      :rules="[
        { required: true, whitespace: true, message: t('common.required') },
      ]"
      ><a-input v-model:value="model.name" :maxlength="100"
    /></a-form-item>
    <a-form-item
      name="description"
      :label="t('gift.description')"
      :rules="[
        {
          required: true,
          whitespace: true,
          max: 1024,
          message: t('gift.descriptionRequired'),
        },
      ]"
      ><a-textarea
        v-model:value="model.description"
        :maxlength="1024"
        :auto-size="{ minRows: 2, maxRows: 4 }"
        show-count
    /></a-form-item>
    <a-form-item
      name="eventDate"
      :label="t('gift.eventDate')"
      :rules="[{ required: true, message: t('common.required') }]"
    >
      <a-date-picker
        v-model:value="model.eventDate"
        value-format="YYYY-MM-DD"
        format="YYYY-MM-DD"
        style="width: 100%"
      />
    </a-form-item>
    <section v-if="model.eventType" class="gift-event-preview-section">
      <div class="gift-event-preview-heading">
        <strong>{{ t('gift.stylePreview') }}</strong
        ><a-button type="link" @click="previewOpen = true">{{
          t('gift.enlargePreview')
        }}</a-button>
      </div>
      <div class="gift-event-style-preview">
        <display-book :snapshot="preview" />
      </div>
    </section>
    <a-form-item v-if="!creating" name="status" :label="t('gift.eventStatus')"
      ><a-select
        v-model:value="model.status"
        :options="[
          { value: 'ACTIVE', label: t('gift.active') },
          { value: 'CLOSED', label: t('gift.closed') },
        ]"
    /></a-form-item>
  </form-modal>
  <a-modal
    wrap-class-name="gift-management-modal"
    :open="open && previewOpen"
    :title="t('gift.preview')"
    :width="'95vw'"
    :footer="null"
    @cancel="previewOpen = false"
  >
    <div class="gift-preview"><display-book :snapshot="preview" /></div>
  </a-modal>
</template>

<style scoped>
.gift-preset-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
  width: 100%;
}
.gift-preset-card {
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: #8e2630;
  color: #ffe6ad;
  align-items: flex-start;
}
.gift-preset-card--birthday {
  background: #9b2b20;
  color: #ffefbc;
}
.gift-preset-card--funeral {
  background: #f8f9f5;
  color: #3e4a41;
}
.gift-preset-card--full_moon {
  background: #f8d8d2;
  color: #6f2a3f;
}
.gift-preset-card--hundred_days {
  background: #f7e3be;
  color: #684425;
}
.gift-preset-card--first_birthday {
  background: #b9472d;
  color: #fff0bf;
}
.gift-preset-card--engagement {
  background: #88314e;
  color: #ffe4cf;
}
.gift-preset-card--housewarming {
  background: #1f5a52;
  color: #fff0bf;
}
.gift-preset-card--graduation {
  background: #243f67;
  color: #fff0c2;
}
.gift-preset-card--business_opening {
  background: #a52625;
  color: #ffecb0;
}
.gift-preset-card.ant-radio-wrapper-checked {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.gift-preset-card :deep(.ant-radio + span) {
  flex: 1;
  min-width: 0;
}
.gift-preset-swatch {
  display: block;
  font-family: 'Gift Handwriting', serif;
  font-size: 40px;
  line-height: 1.2;
  margin-bottom: var(--space-2);
}
.gift-preset-hint {
  display: block;
  font-size: 12px;
  margin-top: var(--space-2);
  line-height: 1.5;
}
.gift-event-preview-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gift-event-style-preview {
  height: 480px;
  overflow: hidden;
  margin-bottom: var(--space-4);
}
.gift-event-style-preview :deep(.gift-book) {
  height: 480px;
  min-height: 480px;
  grid-template-columns: minmax(170px, 28%) minmax(0, 1fr);
}
.gift-event-style-preview :deep(.gift-book-event h1) {
  font-size: 26px;
}
.gift-event-style-preview :deep(.gift-book-description) {
  font-size: 15px;
}
.gift-event-style-preview :deep(.gift-book-emblem) {
  font-size: 90px;
}
.gift-event-style-preview :deep(.gift-book-photo) {
  max-height: 220px;
}
.gift-preview {
  height: 72vh;
  overflow: hidden;
}
@media (width <= 700px) {
  .gift-preset-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .gift-preset-card {
    padding: var(--space-3);
  }
  .gift-preset-swatch {
    font-size: 32px;
  }
}
</style>
