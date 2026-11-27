<script setup lang="ts" generic="T extends object">
import { computed, onMounted, ref, useAttrs, useId, type PropType } from 'vue'
import {
  Modal as AModal,
  Form as AForm,
  Alert as AAlert,
  Button as AButton,
  Space as ASpace,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, required: true },
  model: { type: Object as PropType<T>, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  width: { type: [Number, String], default: 800 },
  formName: { type: String, default: '' },
  embedded: { type: Boolean, default: false },
})
const emit = defineEmits<{ submit: []; cancel: []; 'update:open': [open: boolean] }>()
defineSlots<{ default?: () => unknown; footer?: () => unknown }>()
const { t } = useI18n()
const attrs = useAttrs()
const heading = ref<HTMLElement>()
const instanceId = useId()
// Vue's runtime generic prop inference widens T; keep the caller's declared type without copying it.
const formModel = computed(() => props.model as T)
// A caller prefix describes the form; the instance suffix prevents overlapping dialog field IDs.
const name = computed(() => `${props.formName || 'form'}-${instanceId}`)
function containerProps() {
  return props.embedded
    ? {
        class: ['form-embedded', attrs.class],
        role: 'region',
        'aria-labelledby': `${name.value}-title`,
      }
    : {
        ...attrs,
        open: props.open,
        title: props.title,
        width: props.width,
        maskClosable: false,
        destroyOnClose: true,
        footer: null,
      }
}
onMounted(() => {
  if (props.embedded) heading.value?.focus()
})
function cancel() {
  emit('cancel')
  emit('update:open', false)
}
function keydown(event: KeyboardEvent) {
  if (!props.embedded || event.key !== 'Escape' || attrs.keyboard === false) return
  event.stopPropagation()
  cancel()
}
</script>
<template>
  <component
    :is="embedded ? 'section' : AModal"
    v-bind="containerProps()"
    @cancel="cancel"
    @keydown="keydown"
  >
    <header v-if="embedded" class="form-embedded-heading">
      <h2 :id="`${name}-title`" ref="heading" tabindex="-1">{{ title }}</h2>
    </header>
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-form :name="name" :model="formModel" layout="vertical" @finish="emit('submit')">
      <slot />
      <slot name="footer">
        <a-space class="form-modal-footer">
          <a-button @click="cancel">{{ t('common.cancel') }}</a-button>
          <a-button type="primary" html-type="submit" :loading="busy" :disabled="busy">{{
            t('common.save')
          }}</a-button>
        </a-space>
      </slot>
    </a-form>
  </component>
</template>
<style scoped>
.form-modal-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.form-embedded-heading h2 {
  outline: none;
}
</style>
