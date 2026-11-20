<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MembershipPackage } from '../types'
import { membershipPrice } from '../utils/format'
defineProps<{ packages: MembershipPackage[] }>()
const { t } = useI18n()
</script>
<template>
  <ul class="membership-packages">
    <li v-for="item in packages" :key="item.id" class="membership-package">
      <h3>{{ t(`membership.${item.id}`) }}</h3>
      <strong>{{ membershipPrice(item.priceCents) }}</strong>
      <span>{{ t('membership.duration', { days: item.days }) }}</span>
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
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.membership-package h3 {
  margin: 0;
  font-size: 16px;
}
.membership-package strong {
  color: var(--color-primary);
  font-size: 26px;
}
.membership-package span {
  color: var(--color-muted);
}
@media (width <= 640px) {
  .membership-packages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
