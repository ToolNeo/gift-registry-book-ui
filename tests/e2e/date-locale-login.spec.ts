import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from './system-helpers'

async function choose(page: Page, control: Locator, text: string) {
  await control.locator('.ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .locator('.ant-select-item-option-content')
    .getByText(text, { exact: true })
    .click()
}

async function chineseCalendar(calendar: Locator) {
  await expect(calendar.locator('.ant-picker-date-panel thead th')).toHaveText([
    '一', '二', '三', '四', '五', '六', '日',
  ])
  await expect(calendar.locator('.ant-picker-month-btn')).toHaveText(/\d+月/)
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

for (const width of [1280, 390]) {
  test(`registration stays centered and date controls follow the selected language (${width}px)`, async ({ page }) => {
    test.setTimeout(90000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    await page.route('**/api/authorize/email/captcha/image?*', (route) =>
      route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            key: 'locale-registration-image',
            base64: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><text y="28" font-size="24">A2BCD</text></svg>',
          },
        },
      }),
    )
    await page.setViewportSize({ width, height: 900 })
    await page.goto('login')
    await expect(page).toHaveTitle(/\S/)
    await expect(page.getByLabel('用户名', { exact: true })).toBeVisible()
    const registration = page.locator('.login-registration').getByRole('button', { name: '注册', exact: true })
    await expect(registration).toBeVisible()
    const registerBox = (await registration.boundingBox())!
    const loginBox = (await page.getByRole('button', { name: '登录', exact: true }).boundingBox())!
    expect(registerBox.width).toBeLessThan(100)
    expect(Math.abs(registerBox.x + registerBox.width / 2 - loginBox.x - loginBox.width / 2)).toBeLessThan(2)
    await page.screenshot({ path: test.info().outputPath(`register-center-${width}.png`), fullPage: true })
    await registration.click()
    await expect(page.getByRole('region', { name: '注册账号', exact: true })).toBeVisible()
    await page.getByRole('region', { name: '注册账号', exact: true }).getByRole('button', { name: '返回登录', exact: true }).click()
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await expect(page.locator('.login-registration').getByRole('button', { name: 'Register', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Language', exact: true }).click()
    await login(page, '用户管理')
    await page.goto('logger/access')
    const query = page.locator('.query-row[data-query-row="0.0"]')
    await choose(page, query.locator('.query-field'), '请求时间')
    const calendar = page.locator('.ant-picker-dropdown:visible')
    const inputs = query.locator('.ant-picker-input input')
    await expect(inputs).toHaveCount(2)
    await inputs.first().click()
    await chineseCalendar(calendar)
    await calendar.locator('.ant-picker-month-btn').click()
    await expect(calendar.locator('.ant-picker-month-panel .ant-picker-cell-inner')).toHaveText([
      '1月', '2月', '3月', '4月', '5月', '6月',
      '7月', '8月', '9月', '10月', '11月', '12月',
    ])
    await page.screenshot({ path: test.info().outputPath(`months-zh-${width}.png`), fullPage: true })
    await calendar.getByText('1月', { exact: true }).click()
    const year = new Date().getFullYear()
    await calendar.locator(`.ant-picker-cell-in-view[title="${year}-01-15"]`).click()
    await calendar.getByRole('button', { name: '确定', exact: true }).click()
    await inputs.nth(1).click()
    await calendar.locator(`.ant-picker-cell-in-view[title="${year}-01-16"]`).click()
    await calendar.getByRole('button', { name: '确定', exact: true }).click()
    await expect(inputs.first()).toHaveValue(new RegExp(`^${year}-01-15`))
    await expect(inputs.nth(1)).toHaveValue(new RegExp(`^${year}-01-16`))
    const request = page.waitForRequest((request) => request.url().endsWith('/logger/access/_query'))
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    expect((await request).postDataJSON().terms).toEqual([
      { column: 'requestTime', termType: 'btw', value: [expect.any(Number), expect.any(Number)] },
    ])
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await inputs.first().click()
    await expect(calendar.locator('.ant-picker-date-panel thead th')).toHaveText([
      'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa',
    ])
    await expect(calendar.locator('.ant-picker-month-btn')).toHaveText('Jan')
    await page.getByRole('button', { name: 'Language', exact: true }).click()
    await inputs.first().click()
    await chineseCalendar(calendar)
    await page.keyboard.press('Escape')
    await choose(page, query.locator('.query-operator'), '等于')
    await expect(inputs).toHaveCount(1)
    await inputs.first().click()
    await chineseCalendar(calendar)
    await page.screenshot({ path: test.info().outputPath(`weekdays-zh-${width}.png`), fullPage: true })
    const selected = calendar.locator('.ant-picker-cell-in-view').first()
    const selectedDate = await selected.getAttribute('title')
    await selected.click()
    await calendar.getByRole('button', { name: '确定', exact: true }).click()
    await expect(inputs.first()).toHaveValue(new RegExp(`^${selectedDate}`))
    const single = page.waitForRequest((request) => request.url().endsWith('/logger/access/_query'))
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    expect((await single).postDataJSON().terms).toEqual([
      { column: 'requestTime', termType: 'eq', value: expect.any(Number) },
    ])
    await expect(calendar).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
