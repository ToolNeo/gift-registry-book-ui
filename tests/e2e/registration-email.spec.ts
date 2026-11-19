import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

const captchaImage =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="white"/><text x="12" y="30" font-size="28" fill="#19375f">A2BCD</text></svg>',
  ).toString('base64')
test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  await page.route('**/api/authorize/email/captcha/image?*', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: { key: 'image-key', base64: captchaImage },
      },
    }),
  )
  await page.route('**/api/authorize/register/username/_validate', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: { valid: route.request().postDataJSON().username !== 'taken' },
      },
    }),
  )
})
async function imageProof(modal: ReturnType<import('@playwright/test').Page['getByRole']>) {
  await expect(modal.getByRole('img', { name: '图形验证码', exact: true })).toBeVisible()
  await modal.getByLabel('图形验证码', { exact: true }).fill('A2BCD')
}

test('registration verifies email, recovers failed delivery and creates only the public DTO without signing in', async ({
  page,
}) => {
  test.setTimeout(60000)
  const sent: { body: unknown; cookie?: string; token?: string }[] = [],
    registrations: unknown[] = []
  await page.setViewportSize({ width: 1280, height: 900 })
  let rejectDelivery = true
  await page.route('**/api/authorize/register/email-code', async (route) => {
    const request = route.request()
    sent.push({
      body: request.postDataJSON(),
      cookie: request.headers().cookie,
      token: request.headers()['x-access-token'],
    })
    if (request.postDataJSON().verifyCode !== 'A2BCD')
      await route.fulfill({
        status: 400,
        json: { success: false, status: 400, message: '图形验证码错误' },
      })
    else if (rejectDelivery)
      await route.fulfill({
        status: 503,
        json: { success: false, status: 503, message: '邮件暂不可用，请重试' },
      })
    else
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            challengeId: 'registration-code',
            expiresIn: 300,
            resendAfter: 60,
            maskedEmail: 'p***@example.com',
          },
        },
      })
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/authorize/register')) registrations.push(request.postDataJSON())
  })
  await page.goto('login')
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('用户名', { exact: true }).fill('new-person')
  await modal.getByLabel('名称', { exact: true }).fill('新用户')
  await modal.getByLabel('电子邮箱', { exact: true }).fill('person@example.com')
  await modal.getByLabel('密码', { exact: true }).fill(' Newpassword123 ')
  await modal.getByLabel('确认密码', { exact: true }).fill(' Newpassword123 ')
  await modal.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(modal.getByText('请先发送邮箱验证码', { exact: true })).toBeVisible()
  expect(registrations).toEqual([])
  await page.evaluate(() => {
    document.cookie = 'registration-test=omit-me; Path=/; SameSite=Lax'
  })
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('请填写图形验证码', { exact: true })).toBeVisible()
  expect(sent).toEqual([])
  await modal.getByLabel('图形验证码', { exact: true }).fill('WRONG')
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('图形验证码错误', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('')
  await imageProof(modal)
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('邮件暂不可用，请重试', { exact: true })).toBeVisible()
  await expect(
    page.locator('.ant-message').getByText('验证码已发送，请查收邮箱', { exact: true }),
  ).toHaveCount(0)
  rejectDelivery = false
  await imageProof(modal)
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByRole('button', { name: /秒后重发$/ })).toBeDisabled()
  await expect(modal.getByText('验证码发送至：p***@example.com', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
  const code = modal.getByLabel('邮箱验证码', { exact: true })
  await expect(code).toHaveAttribute('inputmode', 'numeric')
  await expect(code).toHaveAttribute('maxlength', '6')
  await code.fill('999999')
  await modal.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(modal.getByText('验证码错误或已过期', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('密码', { exact: true })).toHaveValue(' Newpassword123 ')
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
  await page.screenshot({
    path: test.info().outputPath('registration-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await code.fill('012345')
  await modal.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(
    page.locator('.ant-message').getByText('注册成功，请登录', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(registrations).toEqual(
    ['999999', '012345'].map((code) => ({
      username: 'new-person',
      name: '新用户',
      email: 'person@example.com',
      password: ' Newpassword123 ',
      challengeId: 'registration-code',
      code,
      verifyKey: 'image-key',
      verifyCode: 'A2BCD',
    })),
  )
  expect(sent).toEqual(
    ['WRONG', 'A2BCD', 'A2BCD'].map((verifyCode) => ({
      body: { email: 'person@example.com', verifyKey: 'image-key', verifyCode },
      cookie: undefined,
      token: undefined,
    })),
  )
  expect(
    await page.evaluate(() => ({
      token: localStorage.getItem('proto-bridge-ui:token'),
      persisted: JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    })),
  ).toEqual({
    token: null,
    persisted: expect.not.stringContaining('registration-code'),
  })
})

test('mobile registration cancels pending email delivery and reopens with an isolated complete form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let release!: () => void,
    sends = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/authorize/register/email-code', async (route) => {
    sends++
    if (sends === 1) await gate
    if (route.request().failure()) return
    await route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          challengeId: sends === 1 ? 'late-code' : 'current-code',
          expiresIn: 300,
          resendAfter: 60,
          maskedEmail: 'n***@example.com',
        },
      },
    })
  })
  await page.goto('login')
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('电子邮箱', { exact: true }).fill('old@example.com')
  await imageProof(modal)
  const sending = page.waitForRequest((request) =>
    request.url().endsWith('/authorize/register/email-code'),
  )
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await sending
  const cancelled = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('/authorize/register/email-code'),
  )
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  expect((await cancelled).failure()?.errorText).toContain('ERR_ABORTED')
  await expect(modal).toHaveCount(0)
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  release()
  await expect(modal.getByLabel('电子邮箱', { exact: true })).toHaveValue('')
  await expect(modal.getByLabel('邮箱验证码', { exact: true })).toHaveValue('')
  await expect(modal.getByText(/验证码发送至/)).toHaveCount(0)
  await modal.getByLabel('电子邮箱', { exact: true }).fill('new@example.com')
  await imageProof(modal)
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('验证码发送至：n***@example.com', { exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: /秒后重发$/ })).toBeDisabled()
  const box = await modal.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('registration-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
})

test('legacy contact email needs first binding before password verification and only confirmed saves end the session', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  let bound = false,
    rejectBinding = true
  const bindingRequests: unknown[] = [],
    passwordRequests: unknown[] = [],
    codeRequests: unknown[] = []
  await page.route('**/api/user/detail', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: {
            success: true,
            status: 200,
            result: {
              id: 'u1',
              username: 'admin',
              name: 'Admin',
              status: 1,
              email: 'legacy-contact@example.com',
            },
          },
        })
      : route.continue(),
  )
  await page.route('**/api/user/me/email', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            bound,
            maskedEmail: bound ? 'p***@example.com' : undefined,
          },
        },
      })
    bindingRequests.push(route.request().postDataJSON())
    if (rejectBinding)
      return route.fulfill({
        status: 400,
        json: { success: false, status: 400, message: '邮箱验证码错误' },
      })
    bound = true
    return route.fulfill({
      json: { success: true, status: 200, result: true },
    })
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/user/me/password') && request.method() === 'PUT')
      passwordRequests.push(request.postDataJSON())
    if (request.url().endsWith('/user/me/password/email-code'))
      codeRequests.push(request.postDataJSON())
  })
  await login(page, '用户管理')
  await page.goto('account/center')
  await expect(
    page.locator('.ant-descriptions').getByText('尚未验证绑定', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('电子邮箱', { exact: true })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  let modal = page.getByRole('dialog')
  await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(modal.getByText('请先验证并绑定邮箱，再修改密码', { exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: '发送验证码', exact: true })).toHaveCount(0)
  await modal.getByRole('button', { name: '绑定邮箱', exact: true }).click()
  modal = page.getByRole('dialog')
  await expect(modal.getByText(/请验证当前密码和邮箱完成首次绑定/)).toBeVisible()
  await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
  await modal.getByLabel('电子邮箱', { exact: true }).fill('person@example.com')
  await imageProof(modal)
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await modal.getByLabel('邮箱验证码', { exact: true }).fill('012345')
  await modal.getByRole('button', { name: '绑定邮箱', exact: true }).click()
  await expect(modal.getByText('邮箱验证码错误', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeTruthy()
  await page.screenshot({
    path: test.info().outputPath('first-binding-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
  rejectBinding = false
  await modal.getByRole('button', { name: '绑定邮箱', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(
    page.locator('.ant-descriptions').getByText('p***@example.com', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '绑定邮箱', exact: true })).toHaveCount(0)
  expect(bindingRequests).toEqual(
    Array.from({ length: 2 }, () => ({
      email: 'person@example.com',
      oldPassword: 'old-password',
      challengeId: 'binding-code',
      code: '012345',
    })),
  )
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  modal = page.getByRole('dialog')
  await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
  await modal.getByRole('button', { name: '下一步', exact: true }).click()
  await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.getByText('请先发送邮箱验证码', { exact: true })).toBeVisible()
  expect(passwordRequests).toEqual([])
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(modal.getByText('请填写图形验证码', { exact: true })).toBeVisible()
  expect(codeRequests).toEqual([])
  await imageProof(modal)
  await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect.poll(() => codeRequests).toEqual([{ verifyKey: 'image-key', verifyCode: 'A2BCD' }])
  await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
  await modal.getByLabel('邮箱验证码', { exact: true }).fill('012345')
  await page.screenshot({
    path: test.info().outputPath('password-email-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  expect(passwordRequests).toEqual([
    {
      oldPassword: 'old-password',
      newPassword: 'Newpassword123',
      challengeId: 'password-code',
      code: '012345',
      verifyKey: 'image-key',
      verifyCode: 'A2BCD',
    },
  ])
  expect(await page.evaluate(() => localStorage.getItem('proto-bridge-ui:token'))).toBeNull()
})

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`registration username feedback and image control remain healthy at ${viewport.width}px`, async ({
    page,
  }) => {
    const errors: string[] = [],
      warnings: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.setViewportSize(viewport)
    await page.goto('login')
    await expect(page).toHaveURL(/\/tools\/login$/)
    expect(await page.title()).not.toBe('')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '注册账号', exact: true }).click()
    const modal = page.getByRole('dialog')
    await imageProof(modal)
    const username = modal.getByLabel('用户名', { exact: true })
    await username.fill('abcd')
    await modal.getByLabel('名称', { exact: true }).click()
    await expect(modal.getByText('用户名长度为5至64个字符', { exact: true })).toBeVisible()
    await username.fill('taken')
    await modal.getByLabel('名称', { exact: true }).click()
    await expect(modal.getByText('用户名已存在，请更换用户名', { exact: true })).toBeVisible()
    await username.fill('available')
    await modal.getByLabel('名称', { exact: true }).fill('注册用户')
    await expect(modal.getByText('用户名已存在，请更换用户名', { exact: true })).toHaveCount(0)
    await modal.getByLabel('电子邮箱', { exact: true }).fill('new@example.com')
    await expect(modal.getByRole('img', { name: '图形验证码', exact: true })).toBeVisible()
    await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
    await modal.getByRole('button', { name: '刷新图形验证码', exact: true }).click()
    await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('')
    await imageProof(modal)
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await page.screenshot({
      path: test.info().outputPath(`registration-health-${viewport.width}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await modal.getByRole('button', { name: '取消', exact: true }).click()
    await expect(modal).toHaveCount(0)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
}

for (const width of [1280, 390]) {
  for (const flow of ['registration', 'password'] as const) {
    test(`${flow} retains its image and submits both proofs (${width}px)`, async ({ page }) => {
      const errors: string[] = [],
        submissions: Record<string, unknown>[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 900 })
      const issuePath =
        flow === 'registration' ? '/authorize/register/email-code' : '/user/me/password/email-code'
      const finalPath = flow === 'registration' ? '/authorize/register' : '/user/me/password'
      await page.route(`**/api${issuePath}`, (route) =>
        route.fulfill({
          json: {
            success: true,
            status: 200,
            result: {
              challengeId: 'joint-proof',
              expiresIn: 300,
              resendAfter: 60,
              maskedEmail: 'p***@example.com',
            },
          },
        }),
      )
      await page.route(`**/api${finalPath}`, (route) => {
        const body = route.request().postDataJSON()
        submissions.push(body)
        const accepted =
          body.challengeId === 'joint-proof' &&
          body.code === '012345' &&
          body.verifyKey === 'image-key' &&
          body.verifyCode === 'A2BCD'
        return route.fulfill({
          status: accepted ? 200 : 400,
          json: {
            success: accepted,
            status: accepted ? 200 : 400,
            result: flow === 'registration' ? { registered: accepted } : accepted,
            message: accepted ? undefined : '图形或邮箱验证码错误',
          },
        })
      })
      if (flow === 'registration') {
        await page.goto('login')
        await page.getByRole('button', { name: '注册账号', exact: true }).click()
        const modal = page.getByRole('dialog')
        await modal.getByLabel('用户名', { exact: true }).fill('joint-user')
        await modal.getByLabel('名称', { exact: true }).fill('联合验证用户')
        await modal.getByLabel('电子邮箱', { exact: true }).fill('person@example.com')
        await modal.getByLabel('密码', { exact: true }).fill('Newpassword123')
        await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
      } else {
        await login(page, '用户管理')
        await page.goto('account/center')
        await page.getByRole('button', { name: '修改密码', exact: true }).click()
        const modal = page.getByRole('dialog')
        await modal.getByLabel('旧密码', { exact: true }).fill('old-password')
        await modal.getByRole('button', { name: '下一步', exact: true }).click()
        await modal.getByLabel('新密码', { exact: true }).fill('Newpassword123')
        await modal.getByRole('button', { name: '下一步', exact: true }).click()
        await modal.getByLabel('确认密码', { exact: true }).fill('Newpassword123')
      }
      const modal = page.getByRole('dialog')
      await imageProof(modal)
      const image = await modal
        .getByRole('img', { name: '图形验证码', exact: true })
        .getAttribute('src')
      await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
      await expect(modal.getByRole('button', { name: /秒后重发$/ })).toBeDisabled()
      await expect(
        modal.getByText(`验证码发送至：${flow === 'registration' ? 'p' : 'a'}***@example.com`, {
          exact: true,
        }),
      ).toBeVisible()
      await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
      await expect(modal.getByRole('img', { name: '图形验证码', exact: true })).toHaveAttribute(
        'src',
        image!,
      )
      await modal.getByLabel('邮箱验证码', { exact: true }).fill('012345')
      await modal.getByLabel('图形验证码', { exact: true }).fill('WRONG')
      const submit = modal.getByRole('button', {
        name: flow === 'registration' ? '注册账号' : '保存',
        exact: true,
      })
      await submit.click()
      await expect(modal.getByText('图形或邮箱验证码错误', { exact: true })).toBeVisible()
      await modal.getByLabel('图形验证码', { exact: true }).fill('A2BCD')
      expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await page.screenshot({
        path: test.info().outputPath(`${flow}-joint-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      await submit.click()
      await expect(modal).toHaveCount(0)
      expect(submissions).toHaveLength(2)
      expect(
        submissions.map((body) => ({ verifyKey: body.verifyKey, verifyCode: body.verifyCode })),
      ).toEqual([
        { verifyKey: 'image-key', verifyCode: 'WRONG' },
        { verifyKey: 'image-key', verifyCode: 'A2BCD' },
      ])
      expect(errors).toEqual([])
    })
  }
}
