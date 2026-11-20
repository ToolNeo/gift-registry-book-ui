import type { MenuEntryRegistry } from '@/shared/router/menu-entry'
const center = () => import('./views/MembershipCenterView.vue')
const management = () => import('./views/MembershipManagementView.vue')
export const componentMap: MenuEntryRegistry['componentMap'] = {
  'membership/Center': center,
  'membership/Management': management,
}
export const componentAliases: MenuEntryRegistry['componentAliases'] = {}
export const menuPathMap: MenuEntryRegistry['menuPathMap'] = {
  '/membership': { code: 'membership/Center', component: center },
  '/membership/manage': {
    code: 'membership/Management',
    component: management,
  },
}
