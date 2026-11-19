<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Space as ASpace,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import DisplayBook from '../components/DisplayBook.vue'
import LoadState from '@/shared/components/LoadState.vue'
import { useDisplay } from '../hooks/useDisplay'

const route = useRoute()
const { t } = useI18n()
const eventId = computed(() => String(route.params.eventId || ''))
const credential = ref('')
const fullscreen = ref(false)

// The fragment is consumed once, removed before subsequent requests and kept per event for reloads.
watch(
  [eventId, () => route.hash],
  ([id]) => {
    const key = `gift-registry:display:${id}`
    const supplied = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    )
    if (supplied) {
      credential.value = supplied
      try {
        sessionStorage.setItem(key, supplied)
      } catch {
        /* The current tab can still display when storage is unavailable. */
      }
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    } else {
      try {
        credential.value = sessionStorage.getItem(key) || ''
      } catch {
        credential.value = ''
      }
    }
  },
  { immediate: true },
)
const bookContainer = ref<HTMLElement>()
const bookWidth = ref(Math.max(0, window.innerWidth - 24))
// Reserve the left event page and at least 100px per entry instead of shrinking the entire book.
const pageSize = computed(() => {
  const width = bookWidth.value
  const eventWidth = Math.max(
    width <= 760 ? 105 : 110,
    width * (width <= 760 ? 0.3 : 0.22),
  )
  return Math.max(1, Math.min(24, Math.floor((width - 16 - eventWidth) / 100)))
})
const { snapshot, loading, error, disconnected, sync } = useDisplay(
  eventId,
  credential,
  pageSize,
)
const pages = computed(() =>
  Math.max(
    1,
    Math.ceil((snapshot.value?.total || 0) / (snapshot.value?.pageSize || 1)),
  ),
)
watch(bookContainer, (element, _, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(([entry]) => {
    if (entry) bookWidth.value = entry.contentRect.width
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

/** Fullscreen is user initiated; normal browser and permission failures keep the display usable. */
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    fullscreen.value = !!document.fullscreenElement
  }
}
const updateFullscreen = () => {
  fullscreen.value = !!document.fullscreenElement
}
document.addEventListener('fullscreenchange', updateFullscreen)
onBeforeUnmount(() =>
  document.removeEventListener('fullscreenchange', updateFullscreen),
)
</script>

<template>
  <div class="gift-display">
    <a-alert
      v-if="disconnected && snapshot"
      type="warning"
      :message="t('gift.disconnected')"
      show-icon
    />
    <load-state
      v-if="!snapshot"
      :loading="loading"
      :error="error"
      @retry="sync(true)"
    />
    <div v-if="snapshot" ref="bookContainer" class="gift-display-book">
      <display-book class="gift-display-content" :snapshot="snapshot" />
    </div>
    <footer v-if="snapshot" class="gift-display-controls">
      <span :class="{ muted: !disconnected }">{{
        t(disconnected ? 'gift.disconnected' : 'gift.connected')
      }}</span>
      <a-space wrap>
        <a-button
          :disabled="snapshot.pageIndex <= 0"
          @click="sync(true, snapshot.pageIndex - 1)"
          >{{ t('gift.previous') }}</a-button
        >
        <span>{{
          t('gift.page', { current: snapshot.pageIndex + 1, total: pages })
        }}</span>
        <a-button
          :disabled="snapshot.pageIndex + 1 >= pages"
          @click="sync(true, snapshot.pageIndex + 1)"
          >{{ t('gift.next') }}</a-button
        >
        <a-button @click="toggleFullscreen">{{
          t(fullscreen ? 'gift.exitFullscreen' : 'gift.fullscreen')
        }}</a-button>
      </a-space>
    </footer>
  </div>
</template>

<style scoped>
.gift-display {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100dvh;
  padding: var(--space-3);
}
.gift-display-book {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.gift-display-book > .gift-display-content {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.gift-display-controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: 14px;
}
@media (width <= 600px) {
  .gift-display {
    padding: 8px;
  }
  .gift-display-controls {
    justify-content: center;
    gap: 6px;
  }
  .gift-display-controls > span {
    width: 100%;
    text-align: center;
  }
}
</style>
