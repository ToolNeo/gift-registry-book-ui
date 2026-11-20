import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useNavigation } from '@/app/composables/useNavigation'
import { useSession } from '@/app/stores/session'
import { defaultPage } from '@/app/router/navigation'
import type { ServerMenu } from '@/shared/auth/types'

const users: ServerMenu = {
  id: 'users',
  code: 'system/User',
  name: '用户管理',
  url: '/system/user',
  sortIndex: 10,
}
const roles: ServerMenu = {
  id: 'roles',
  code: 'system/Role',
  name: '角色管理',
  url: '/system/Role',
  sortIndex: 20,
}
const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

async function navigationFor(menus: ServerMenu[], path: string) {
  const pinia = createPinia(),
    session = useSession(pinia)
  session.menus = menus
  session.permissions = new Set(['gift-registry:query'])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [path].map((route) => ({ path: route, component: { render: () => null } })),
  })
  await router.push(path)
  await router.isReady()
  let navigation!: ReturnType<typeof useNavigation>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          navigation = useNavigation()
          return () => null
        },
      }),
      { global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'zh' })] } },
    ),
  )
  expect(session.can('gift-registry:query')).toBe(true)
  return navigation.navigation.value
}

describe('default menu with gift registry permission', () => {
  it('uses the first sorted configured page and its selection, skipping hidden and denied pages', async () => {
    const navigation = await navigationFor(
      [
        {
          id: 'system',
          code: 'directory',
          name: '系统管理',
          children: [
            roles,
            { ...users, id: 'denied', sortIndex: 0, granted: false },
            { ...roles, id: 'hidden', sortIndex: 1, options: { show: false } },
            users,
          ],
        },
      ],
      '/system/user',
    )
    expect(defaultPage(navigation.primary)).toBe('/system/user')
    expect(navigation.primary.map((item) => item.title)).toEqual(['系统管理'])
    expect(navigation.secondary.map((item) => item.key)).toEqual(['/system/user', '/system/Role'])
    expect(navigation.selectedKeys).toEqual(['/system/user'])
  })

  it('falls back to the personal page without creating a gift menu when no menu is configured', async () => {
    const navigation = await navigationFor([], '/account/center')
    expect(navigation.primary).toEqual([])
    expect(navigation.selectedKeys).toEqual([])
    expect(defaultPage(navigation.primary)).toBe('/account/center')
  })

  it('preserves an actual configured gift page and its custom path when it is first', async () => {
    const navigation = await navigationFor(
      [
        { ...users, sortIndex: 20 },
        {
          id: 'book',
          code: 'gift-registry/Event',
          name: '自定义礼簿',
          url: '/my-book',
          sortIndex: 10,
        },
      ],
      '/my-book',
    )
    expect(navigation.primary.map((item) => item.key)).toEqual(['/my-book', '/system/user'])
    expect(defaultPage(navigation.primary)).toBe('/my-book')
    expect(navigation.selectedKeys).toEqual(['/my-book'])
  })
})
