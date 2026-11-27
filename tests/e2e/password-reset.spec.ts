import { expect, test, type Locator, type Page } from '@playwright/test'

const image =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="white"/><text x="12" y="30" font-size="28" fill="#19375f">A2BCD</text></svg>',
  ).toString('base64')
const challenge = {
  challengeId: 'password-reset-challenge',
  expiresIn: 0,
  resendAfter: 60,
  maskedEmail: 'p***@example.com',
  deliveryStatus: 'SENDING',
}
const ok = (result: unknown) => ({ success: true, status: 200, result })
test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  await page.route('**/api/authorize/email/captcha/image?*', (route) =>
    route.fulfill({ json: ok({ key: 'reset-image', base64: image }) }),
  )
  await page.route('**/api/authorize/email/code/password-reset-challenge', (route) =>
    route.fulfill({ json: ok({ status: 'SENT', expiresIn: 300 }) }),
  )
})
async function open(page: Page) {
  await page.goto('login')
  const register = page.getByRole('button', { name: '注册', exact: true })
  const forgot = page.getByRole('button', { name: '忘记密码', exact: true })
  await expect(register).toBeVisible()
  await expect(forgot).toBeVisible()
  const options = await page.locator('.login-remember').boundingBox()
  const recovery = await forgot.boundingBox()
  expect(recovery!.x + recovery!.width).toBeCloseTo(options!.x + options!.width, 0)
  // Recovery, submit and registration remain in the natural keyboard tab order.
  await forgot.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(register).toBeFocused()
  await forgot.focus()
  await page.keyboard.press('Enter')
  const modal = page.getByRole('region', { name: '忘记密码', exact: true })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('img', { name: '图形验证码', exact: true })).toBeVisible()
  return modal
}
async function identity(modal: Locator, email = 'person@example.com') {
  await modal.getByLabel('用户名', { exact: true }).fill('person')
  await modal.getByLabel('电子邮箱', { exact: true }).fill(email)
  await modal.getByLabel('图形验证码', { exact: true }).fill('A2BCD')
}
async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const modal = page.getByRole('region')
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  )
}

test('desktop password reset preserves both codes, hides mismatch details and returns to login', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const errors: string[] = [],
    requests: unknown[] = [],
    resets: unknown[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    // Rejected-code fixtures intentionally return 400; other console errors are regressions.
    if (message.type() === 'error' && !message.text().includes('status of 400'))
      errors.push(message.text())
  })
  await page.route('**/api/authorize/password/reset/email-code', (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(route.request().headers()['x-access-token']).toBeUndefined()
    return body.email === 'wrong@example.com'
      ? route.fulfill({
          status: 400,
          json: {
            success: false,
            status: 400,
            code: 'PASSWORD_RESET_INVALID',
            message: 'private account existence details',
          },
        })
      : route.fulfill({ json: ok(challenge) })
  })
  await page.route('**/api/authorize/password/reset', (route) => {
    const body = route.request().postDataJSON()
    resets.push(body)
    return body.code === '012345'
      ? route.fulfill({ json: ok(true) })
      : route.fulfill({
          status: 400,
          json: {
            success: false,
            status: 400,
            code: 'PASSWORD_RESET_INVALID',
            message: 'private code mismatch details',
          },
        })
  })
  const modal = await open(page)
  await identity(modal, 'wrong@example.com')
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('操作未完成，请核对信息后重试', { exact: true })).toBeVisible()
  await expect(modal).not.toContainText('private')
  await identity(modal)
  await modal.getByLabel('新密码', { exact: true }).fill(' Newpassword123 ')
  await modal.getByLabel('确认密码', { exact: true }).fill(' Newpassword123 ')
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByRole('status')).toBeVisible()
  await expect(modal.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
  await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
  await modal.getByLabel('邮箱验证码', { exact: true }).fill('999999')
  await modal.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(modal.getByText('操作未完成，请核对信息后重试', { exact: true })).toBeVisible()
  await expect(modal).not.toContainText('private')
  await expect(modal.getByLabel('新密码', { exact: true })).toHaveValue(' Newpassword123 ')
  await assertNoOverflow(page)
  await page.screenshot({
    path: '/private/tmp/gift-r21-password-reset-desktop.png',
    fullPage: true,
  })
  await modal.getByLabel('邮箱验证码', { exact: true }).fill('012345')
  await modal.getByLabel('确认密码', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(page.locator('.ant-message')).toContainText('密码重置成功，请使用新密码登录')
  expect(requests).toEqual(
    ['wrong@example.com', 'person@example.com'].map((email) => ({
      username: 'person',
      email,
      verifyKey: 'reset-image',
      verifyCode: 'A2BCD',
    })),
  )
  expect(resets).toEqual(
    ['999999', '012345'].map((code) => ({
      username: 'person',
      email: 'person@example.com',
      newPassword: ' Newpassword123 ',
      challengeId: 'password-reset-challenge',
      code,
      verifyKey: 'reset-image',
      verifyCode: 'A2BCD',
    })),
  )
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(':token'))),
  ).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('mobile reset stays within the viewport and cancels pending mail when closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/authorize/password/reset/email-code', async (route) => {
    await gate
    if (!route.request().failure()) await route.fulfill({ json: ok(challenge) })
  })
  const modal = await open(page)
  await identity(modal)
  await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
  await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
  await assertNoOverflow(page)
  await page.screenshot({
    path: '/private/tmp/gift-r21-password-reset-mobile.png',
    fullPage: true,
  })
  const sending = page.waitForRequest((request) =>
    request.url().endsWith('/authorize/password/reset/email-code'),
  )
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await sending
  const cancelled = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('/authorize/password/reset/email-code'),
  )
  await modal.getByRole('button', { name: '返回登录', exact: true }).click()
  expect((await cancelled).failure()?.errorText).toContain('ERR_ABORTED')
  release()
  await expect(modal).toHaveCount(0)
  await page
    .locator('.login-remember')
    .getByRole('button', { name: '忘记密码', exact: true })
    .click()
  await expect(modal.getByLabel('用户名', { exact: true })).toHaveValue('')
  await expect(modal.getByLabel('电子邮箱', { exact: true })).toHaveValue('')
  await expect(modal.getByLabel('新密码', { exact: true })).toHaveValue('')
  await expect(modal.getByLabel('邮箱验证码', { exact: true })).toHaveValue('')
  await expect(modal.getByText(/验证码发送至/)).toHaveCount(0)
  await assertNoOverflow(page)
  await modal.getByLabel('用户名', { exact: true }).focus()
  await expect(modal.getByLabel('用户名', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
