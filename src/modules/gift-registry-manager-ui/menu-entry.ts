import type { MenuEntryRegistry } from '@/shared/router/menu-entry'
import type { ServerMenu } from '@/shared/auth/types'

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

/** Preserve the legacy book entry only; activity management is supplied by configured menus. */
export function withGiftMenu(
  menus: ServerMenu[],
  allowed: boolean,
): ServerMenu[] {
  const containsGift = (
    nodes: ServerMenu[],
    code: string,
    path: string,
  ): boolean =>
    nodes.some(
      (node) =>
        node.code === code ||
        node.url === path ||
        containsGift(node.children || [], code, path),
    )
  if (!allowed) return menus
  const fallbacks: ServerMenu[] = [
    {
      id: 'gift-registry-fallback',
      code: 'gift-registry/Event',
      name: '电子礼簿',
      i18nMessages: { name: { zh_CN: '电子礼簿', en_US: 'Gift registry' } },
      url: '/gift-registry',
      granted: true,
    },
  ]
  const missing = fallbacks.filter(
    (item) => !containsGift(menus, item.code!, item.url!),
  )
  return missing.length ? [...missing, ...menus] : menus
}
