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
          class="gift-preset-option"
        >
          {{ t(`gift.${preset.value}`) }}
        </a-radio>
      </a-radio-group>
    </a-form-item>
    <div class="gift-event-details">
      <a-form-item
        name="name"
        :label="t('gift.eventName')"
        :rules="[
          { required: true, whitespace: true, message: t('common.required') },
        ]"
        ><a-input v-model:value="model.name" :maxlength="100"
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
    </div>
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
.gift-preset-option {
  margin: 0;
  padding: var(--space-2);
}
.gift-preset-option.ant-radio-wrapper-checked {
  color: var(--color-primary);
}
.gift-event-details {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--space-4);
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
  .gift-event-details {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
