<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CalendarOutlined } from '@ant-design/icons-vue'
import type { MembershipPackage } from '../types'
defineProps<{ packages: MembershipPackage[] }>()
const { t } = useI18n()
</script>
<template>
  <ul class="membership-packages">
    <li
      v-for="item in packages"
      :key="item.id"
      class="membership-package"
      :data-period="item.id"
    >
      <div class="membership-package-heading">
        <h3>{{ t(`membership.${item.id}`) }}</h3>
        <span
          class="membership-package-term"
          :aria-label="`${t('membership.validity')} ${t('membership.duration', { days: item.days })}`"
        >
          <calendar-outlined aria-hidden="true" />
          {{ t('membership.duration', { days: item.days }) }}
        </span>
      </div>
      <strong class="membership-package-price"
        ><span class="membership-package-currency">¥</span
        ><span>{{ (item.priceCents / 100).toFixed(2) }}</span></strong
      >
    </li>
  </ul>
</template>
<style scoped>
.membership-packages {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.membership-package {
  --package-tint: 4%;

  min-width: 0;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.membership-package[data-period='WEEK'] {
  --package-tint: 7%;
}
.membership-package[data-period='MONTH'] {
  --package-tint: 10%;
}
.membership-package[data-period='QUARTER'] {
  --package-tint: 13%;
}
.membership-package-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  background: color-mix(
    in srgb,
    var(--color-primary) var(--package-tint),
    var(--color-surface)
  );
  border-bottom: 1px solid var(--color-border);
}
.membership-package h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}
.membership-package-price {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  margin: var(--space-6);
  color: var(--color-primary);
  font-size: 32px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  white-space: nowrap;
}
.membership-package-currency {
  color: var(--color-text);
  font-size: 18px;
}
.membership-package-term {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: color-mix(in srgb, var(--color-primary) 80%, var(--color-text));
  font-size: var(--text-small);
  line-height: 1.5;
}
@media (width <= 960px) {
  .membership-packages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 480px) {
  .membership-package-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
  }
  .membership-package-price {
    margin: var(--space-4);
    font-size: 28px;
  }
}
@media (width <= 360px) {
  .membership-packages {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
