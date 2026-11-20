import {
  componentMap as authComponents,
  componentAliases as authAliases,
  menuPathMap as authPaths,
} from '@/modules/authentication-manager-ui'
import {
  componentMap as giftComponents,
  componentAliases as giftAliases,
  menuPathMap as giftPaths,
} from '@/modules/gift-registry-manager-ui'
import type { ServerMenu } from '@/shared/auth/types'
import {
  componentMap as membershipComponents,
  componentAliases as membershipAliases,
  menuPathMap as membershipPaths,
} from '@/modules/membership-manager-ui'
import { resolveRegisteredMenuComponent } from '@/shared/router/menu-entry'
export const componentMap = {
  ...authComponents,
  ...giftComponents,
  ...membershipComponents,
}
export const componentAliases = {
  ...authAliases,
  ...giftAliases,
  ...membershipAliases,
}
export const menuPathMap = { ...authPaths, ...giftPaths, ...membershipPaths }
export function resolveMenuComponent(menu: ServerMenu, path: string) {
  return resolveRegisteredMenuComponent(menu, path, {
    componentMap,
    componentAliases,
    menuPathMap,
  })
}
