import { expect, test, type Page } from '@playwright/test'
import type { ServerMenu } from '../../src/shared/auth/types'

const users: ServerMenu = {
  id: 'users',
  code: 'system/User',
  name: '首个页面用户',
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
const system: ServerMenu = {
  id: 'system',
  code: 'directory',
  name: '系统导航',
  children: [roles, users],
}

test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  await page.route('**/api/authorize/me', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.result.permissions.push({ id: 'gift-registry', actions: ['query'] })
    await route.fulfill({ response, json: body })
  })
})

async function signIn(page: Page, menus: ServerMenu[], redirect?: string) {
  await page.route('**/api/menu/user-own/tree', (route) =>
    route.fulfill({
      json: { success: true, status: 200, result: menus },
    }),
  )
  await page.goto(redirect ? `login?redirect=${encodeURIComponent(redirect)}` : 'login')
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('test-login-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

for (const width of [1280, 390]) {
  test(`gift permission does not replace the first configured menu (${width}px)`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (entry) => {
      if (entry.type() === 'error') errors.push(entry.text())
    })
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await signIn(page, [system])
    await expect(page).toHaveURL(/\/system\/user$/)
    await expect(page).toHaveTitle((await page.locator('.pro-brand').innerText()).trim())
    await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible()
    const primary = page.getByRole('navigation', { name: '一级菜单' })
    await expect(primary.getByRole('menuitem')).toHaveCount(1)
    await expect(primary.getByRole('menuitem', { name: '系统导航', exact: true })).toHaveClass(
      /ant-menu-item-selected/,
    )
    const menu =
      width === 390
        ? page.getByRole('navigation', { name: '二三级菜单' })
        : page.getByRole('complementary', { name: '二三级菜单' })
    if (width === 390) {
      await page.getByRole('button', { name: '打开菜单', exact: true }).click()
      await expect
        .poll(async () => (await page.locator('.ant-drawer-content-wrapper').boundingBox())?.x)
        .toBe(0)
      const label = await menu.getByText('首个页面用户', { exact: true }).boundingBox()
      expect(label).not.toBeNull()
      expect(label!.x).toBeGreaterThanOrEqual(0)
      expect(label!.x + label!.width).toBeLessThanOrEqual(width)
    }
    await expect(menu.getByRole('menuitem', { name: '首个页面用户', exact: true })).toHaveClass(
      /ant-menu-item-selected/,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await page.screenshot({ path: `/private/tmp/gift-r22-menu-${width}.png`, fullPage: false })
    expect(errors).toEqual([])
  })
}

test('gift permission with no configured menu opens personal center without synthetic navigation', async ({
  page,
}) => {
  await signIn(page, [])
  await expect(page).toHaveURL(/\/account\/center$/)
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: '一级菜单' }).getByRole('menuitem'),
  ).toHaveCount(0)
  await expect(page.locator('.pro-sider')).toHaveCount(0)
})

test('an explicit authorized detail redirect keeps its query and hash', async ({ page }) => {
  await signIn(page, [system], '/system/Role/Detail/r1?from=login#permissions')
  await expect(page).toHaveURL(/\/system\/Role\/Detail\/r1\?from=login#permissions$/)
  await expect(page.getByRole('heading', { name: '角色管理', exact: true })).toBeVisible()
})
