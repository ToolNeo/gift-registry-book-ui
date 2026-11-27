<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { DisplaySnapshot } from '../types'
import { eventPresets } from '../themes'
import { resolveActivityPhotoUrl } from '../utils/photos'
import { formatAmount, uppercaseRmb } from '../utils/money'

const props = defineProps({
  snapshot: { type: Object as PropType<DisplaySnapshot>, required: true },
})
const { t } = useI18n()
const preset = computed(
  () =>
    eventPresets.find(
      (item) => item.value === props.snapshot.event.eventType,
    ) || eventPresets[0]!,
)
const slots = computed(() =>
  Array.from(
    { length: props.snapshot.pageSize },
    (_, index) => props.snapshot.entries[index],
  ),
)
const book = ref<HTMLElement>()
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false

/** Fit the complete text after layout/font changes; each cell keeps its own readable maximum. */
function fitText() {
  if (!book.value) return
  for (const box of book.value.querySelectorAll<HTMLElement>('[data-fit]')) {
    const text = box.querySelector<HTMLElement>('[data-fit-content]')
    if (!text) continue
    text.style.fontSize = ''
    const style = getComputedStyle(box)
    // Fractional layout sizes avoid rejecting text that fits within a subpixel cell.
    const width =
      parseFloat(style.width) -
      parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    const height =
      parseFloat(style.height) -
      parseFloat(style.borderTopWidth) -
      parseFloat(style.borderBottomWidth) -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom)
    if (width <= 0 || height <= 0) continue
    let low = 0.25
    let high = parseFloat(getComputedStyle(text).fontSize)
    const fits = () => {
      const textStyle = getComputedStyle(text)
      return (
        parseFloat(textStyle.width) <= width + 0.1 &&
        parseFloat(textStyle.height) <= height + 0.1 &&
        text.scrollWidth <= width + 1 &&
        text.scrollHeight <= height + 1
      )
    }
    if (fits()) continue
    for (let step = 0; step < 12; step++) {
      const size = (low + high) / 2
      text.style.fontSize = `${size}px`
      if (fits()) low = size
      else high = size
    }
    text.style.fontSize = `${low}px`
  }
}

/** Batch ResizeObserver/font events into one frame and ignore pending font promises after unmount. */
function scheduleFit() {
  if (disposed) return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(fitText)
}
watch(
  () => props.snapshot,
  async () => {
    await nextTick()
    if (disposed) return
    observer?.disconnect()
    if (book.value) {
      observer?.observe(book.value)
      book.value
        .querySelectorAll<HTMLElement>('[data-fit]')
        .forEach((box) => observer?.observe(box))
    }
    scheduleFit()
  },
  { flush: 'post' },
)
onMounted(() => {
  observer = new ResizeObserver(scheduleFit)
  if (book.value) {
    observer.observe(book.value)
    book.value
      .querySelectorAll<HTMLElement>('[data-fit]')
      .forEach((box) => observer?.observe(box))
  }
  void document.fonts.ready.then(scheduleFit)
  document.fonts.addEventListener('loadingdone', scheduleFit)
  scheduleFit()
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  cancelAnimationFrame(frame)
  document.fonts.removeEventListener('loadingdone', scheduleFit)
})
</script>

<template>
  <section
    ref="book"
    class="gift-book"
    :class="`gift-book--${preset.value.toLowerCase()}`"
    :data-event-type="preset.value"
    :aria-label="t('gift.display')"
  >
    <aside class="gift-book-event">
      <header class="gift-book-heading" data-fit>
        <h1 data-fit-content>{{ snapshot.settings.title }}</h1>
      </header>
      <p
        v-if="snapshot.event.description"
        class="gift-book-description"
        data-fit
        :aria-label="t('gift.description')"
      >
        <span data-fit-content>{{ snapshot.event.description }}</span>
      </p>
      <div class="gift-book-photo-frame">
        <img
          v-if="snapshot.settings.photoUrl"
          class="gift-book-photo"
          :src="resolveActivityPhotoUrl(snapshot.settings.photoUrl)"
          :alt="t('gift.photo')"
        />
        <div v-else class="gift-book-emblem" aria-hidden="true">
          <span v-if="preset.ornament">{{ preset.ornament }}</span>
          <svg
            v-else
            class="gift-book-flower"
            viewBox="0 0 120 120"
            fill="none"
          >
            <g stroke="currentColor" stroke-width="1.3">
              <ellipse
                v-for="angle in [0, 30, 60, 90, 120, 150]"
                :key="angle"
                cx="60"
                cy="60"
                rx="12"
                ry="44"
                :transform="`rotate(${angle} 60 60)`"
              />
              <circle cx="60" cy="60" r="10" />
              <path d="M60 104v13M60 112c-15 0-24-8-26-17 14 0 23 6 26 17Z" />
            </g>
          </svg>
        </div>
      </div>
      <div class="gift-book-date" data-fit>
        <span data-fit-content>{{ snapshot.event.eventDate }}</span>
      </div>
      <svg
        v-if="preset.value === 'BIRTHDAY'"
        class="gift-book-cloud"
        viewBox="0 0 180 30"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 23h35c-12-15 5-29 16-17 7-7 18-2 17 6h36c-1-8 10-13 17-6 11-12 28 2 16 17h35M26 29h128M67 19h46"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    </aside>
    <main class="gift-book-pages">
      <div v-if="!snapshot.total" class="gift-book-empty">
        {{ t(`gift.empty_${preset.value}`) }}
      </div>
      <div
        v-else
        class="gift-book-columns"
        :style="{ '--book-columns': snapshot.pageSize }"
      >
        <article
          v-for="(entry, index) in slots"
          :key="entry?.id || `blank-${index}`"
          class="gift-book-column"
        >
          <div v-if="entry" class="gift-book-name" data-fit>
            <span class="gift-book-writing" data-fit-content>{{
              entry.name
            }}</span>
          </div>
          <div class="gift-book-label-cell" data-fit>
            <span v-if="entry" class="gift-book-label" data-fit-content>
              {{ t(`gift.gift_${preset.value}`) }}
            </span>
          </div>
          <div class="gift-book-amount-section">
            <div v-if="entry" class="gift-book-amount" data-fit>
              <span class="gift-book-writing" data-fit-content>{{
                uppercaseRmb(entry.amountCents)
              }}</span>
            </div>
            <div class="gift-book-number-cell" data-fit>
              <div
                v-if="entry"
                class="gift-book-amount-number"
                data-fit-content
              >
                {{ formatAmount(entry.amountCents) }}
              </div>
            </div>
          </div>
        </article>
      </div>
    </main>
  </section>
</template>

<style scoped>
@font-face {
  font-family: 'Gift Handwriting';
  src: url('../assets/fonts/MaShanZheng-Regular.ttf') format('truetype');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
.gift-book {
  --book-rule: #d0a863;
  --book-paper: #8e2630;
  --book-ink: #ffe6ad;
  --book-accent: #d0a863;
  --book-panel: #681725;
  --book-panel-ink: #ffe7aa;
  display: grid;
  grid-template-columns: minmax(110px, 22%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 0;
  color: var(--book-ink);
  background: var(--book-paper);
  border: 8px double var(--book-accent);
  font-family: 'Songti SC', SimSun, serif;
}
.gift-book--birthday {
  --book-rule: #dbb56d;
  --book-paper: #9b2b20;
  --book-ink: #ffefbc;
  --book-accent: #dbb56d;
  --book-panel: #761b17;
  --book-panel-ink: #ffedb4;
}
.gift-book--funeral {
  --book-rule: #66706a;
  --book-paper: #fafaf7;
  --book-ink: #2e3530;
  --book-accent: #707970;
  --book-panel: #f0f1eb;
  --book-panel-ink: #38443c;
}
.gift-book--full_moon {
  --book-rule: #ac6971;
  --book-paper: #f8d8d2;
  --book-ink: #6f2a3f;
  --book-accent: #ac6971;
  --book-panel: #edb4b1;
  --book-panel-ink: #69273b;
}
.gift-book--hundred_days {
  --book-rule: #a67a36;
  --book-paper: #f7e3be;
  --book-ink: #684425;
  --book-accent: #a67a36;
  --book-panel: #edcd93;
  --book-panel-ink: #65401f;
}
.gift-book--first_birthday {
  --book-rule: #e2b05b;
  --book-paper: #b9472d;
  --book-ink: #fff0bf;
  --book-accent: #e2b05b;
  --book-panel: #893522;
  --book-panel-ink: #fff0bf;
}
.gift-book--engagement {
  --book-rule: #dca597;
  --book-paper: #88314e;
  --book-ink: #ffe4cf;
  --book-accent: #dca597;
  --book-panel: #65223b;
  --book-panel-ink: #ffe4cf;
}
.gift-book--housewarming {
  --book-rule: #c6ab68;
  --book-paper: #1f5a52;
  --book-ink: #fff0bf;
  --book-accent: #c6ab68;
  --book-panel: #16443d;
  --book-panel-ink: #fff0bf;
}
.gift-book--graduation {
  --book-rule: #c5a568;
  --book-paper: #243f67;
  --book-ink: #fff0c2;
  --book-accent: #c5a568;
  --book-panel: #192e4e;
  --book-panel-ink: #fff0c2;
}
.gift-book--business_opening {
  --book-rule: #ddb04c;
  --book-paper: #a52625;
  --book-ink: #ffecb0;
  --book-accent: #ddb04c;
  --book-panel: #7a1d1c;
  --book-panel-ink: #ffecb0;
}
.gift-book-event {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-4);
  color: var(--book-panel-ink);
  background: var(--book-panel);
  border: 1px solid var(--book-accent);
  outline: 1px solid var(--book-accent);
  outline-offset: -6px;
  text-align: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.gift-book-heading {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 22%;
  min-height: 0;
  overflow: hidden;
}
.gift-book-event h1 {
  margin: 0;
  width: 100%;
  font-size: clamp(24px, 2.6vw, 44px);
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.gift-book-description {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: clamp(14px, 1.3vw, 20px);
  line-height: 1.65;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 26%;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}
.gift-book-description > span {
  display: block;
  width: 100%;
}
.gift-book-photo-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}
.gift-book-photo {
  max-width: 100%;
  width: auto;
  height: 100%;
  max-height: 46vh;
  min-height: 0;
  object-fit: contain;
}
.gift-book-emblem {
  width: 80%;
  font-family: 'Gift Handwriting', 'Songti SC', serif;
  font-size: clamp(80px, 10vw, 180px);
  line-height: 1.2;
  opacity: 0.9;
}
.gift-book-flower {
  width: 100%;
  max-height: 220px;
}
.gift-book-cloud {
  width: 85%;
  height: 28px;
  flex-shrink: 0;
}
.gift-book-date {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 2em;
  flex-shrink: 0;
  font-size: clamp(15px, 1.4vw, 22px);
  overflow-wrap: anywhere;
}
.gift-book-pages {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.gift-book-columns {
  display: grid;
  grid-template-columns: repeat(var(--book-columns), minmax(0, 1fr));
  height: 100%;
}
.gift-book-column {
  /* Every column reserves the same band row, including blanks, so its frame stays continuous. */
  display: grid;
  grid-template-rows: minmax(0, 36%) clamp(44px, 9%, 72px) minmax(0, 1fr);
  justify-items: center;
  border-right: 1px solid var(--book-rule);
  min-width: 0;
  min-height: 0;
}
.gift-book-column:last-child {
  border-right: 0;
}
.gift-book-name,
.gift-book-amount {
  display: flex;
  font-family: 'Gift Handwriting', 'Songti SC', SimSun, serif;
  font-weight: 400;
  overflow: hidden;
  width: 100%;
}
.gift-book-writing {
  /* Each fitted vertical string is centered independently in its name or amount cell. */
  flex: none;
  margin: auto;
  writing-mode: vertical-rl;
  text-orientation: upright;
  white-space: nowrap;
  height: max-content;
  line-height: 1.15;
}
.gift-book-name {
  grid-row: 1;
  font-size: clamp(32px, calc(2.5vw + 4px), 46px);
  height: 100%;
  min-height: 0;
  padding: 12px 0;
}
.gift-book-name .gift-book-writing {
  letter-spacing: 0.13em;
}
.gift-book-amount .gift-book-writing {
  letter-spacing: 0.08em;
}
.gift-book-label-cell {
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  border-block: 1px solid var(--book-rule);
}
.gift-book-column:first-child .gift-book-label-cell {
  border-left: 1px solid var(--book-rule);
}
.gift-book-column:last-child .gift-book-label-cell {
  border-right: 1px solid var(--book-rule);
}
.gift-book-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: clamp(20px, 1.7vw, 28px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-align: center;
}
.gift-book-amount-section {
  grid-row: 3;
  display: grid;
  grid-template-rows: minmax(0, 1fr) calc(2rem + 1px);
  min-height: 0;
  width: 100%;
}
.gift-book-amount {
  min-height: 0;
  height: 100%;
  padding: 12px 0;
  font-size: clamp(28px, calc(2vw + 4px), 38px);
}
.gift-book-amount-number {
  display: flex;
  align-items: center;
  height: 100%;
  flex: none;
  font-family: Arial, sans-serif;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  writing-mode: horizontal-tb;
  white-space: nowrap;
  text-align: center;
}
.gift-book-number-cell {
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border-top: 1px solid var(--book-rule);
}
.gift-book-empty {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 26px;
  padding: var(--space-8);
  text-align: center;
  color: var(--book-rule);
}
@media (width <= 760px) {
  .gift-book {
    grid-template-columns: minmax(105px, 30%) minmax(0, 1fr);
    border-width: 6px;
  }
  .gift-book-event {
    padding: var(--space-2);
    gap: var(--space-2);
  }
  .gift-book-label {
    font-size: 20px;
    letter-spacing: 0;
  }
}
@media (height <= 480px) {
  .gift-book-event {
    gap: 4px;
    padding-block: 6px;
  }
  .gift-book-name,
  .gift-book-amount {
    padding-block: 4px;
  }
  .gift-book-cloud {
    height: 14px;
  }
}
</style>
