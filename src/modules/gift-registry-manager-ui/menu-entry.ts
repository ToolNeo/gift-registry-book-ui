import type { MenuEntryRegistry } from '@/shared/router/menu-entry'

const component = () => import('./views/WorkspaceView.vue')
const management = () => import('./views/EventManagementView.vue')
export const componentMap: MenuEntryRegistry['componentMap'] = {
  'gift-registry/Event': component,
  'gift-registry/Manage': management,
}
export const componentAliases: MenuEntryRegistry['componentAliases'] = {}
export const menuPathMap: MenuEntryRegistry['menuPathMap'] = {
  '/gift-registry': { code: 'gift-registry/Event', component },
  '/gift-registry/events': {
    code: 'gift-registry/Manage',
    component: management,
  },
}
