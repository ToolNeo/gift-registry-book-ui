import { expect, test } from '@playwright/test'

const captchaImage =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="white"/><text x="12" y="30" font-size="28">A2BCD</text></svg>',
  ).toString('base64')

for (const width of [1280, 390]) {
  test(`email waits for SMTP confirmation beyond 30 seconds without resending (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.install()
    let sends = 0,
      polls = 0,
      sent = false
    await page.route('**/api/authorize/email/captcha/image?*', (route) =>
      route.fulfill({
        json: {
          success: true,
          status: 200,
          result: { key: 'image-key', base64: captchaImage },
        },
      }),
    )
    await page.route('**/api/authorize/register/email-code', (route) => {
      sends++
      return route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            challengeId: '00000000-0000-0000-0000-000000000001',
            deliveryStatus: 'SENDING',
            expiresIn: 0,
            resendAfter: 60,
            maskedEmail: 'p***@example.test',
          },
        },
      })
    })
    await page.route('**/api/authorize/email/code/*', (route) => {
      polls++
      return route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            status: sent ? 'SENT' : 'SENDING',
            expiresIn: sent ? 300 : 0,
          },
        },
      })
    })
    await page.goto('login')
    await page.locator('.login-registration').getByRole('button', { name: '注册', exact: true }).click()
    const modal = page.getByRole('region', { name: '注册账号', exact: true })
    await modal.getByLabel('电子邮箱', { exact: true }).fill('person@example.test')
    await modal.getByLabel('图形验证码', { exact: true }).fill('A2BCD')
    await modal.getByRole('button', { name: '发送验证码', exact: true }).click()
    await expect(modal.getByRole('status')).toContainText('邮件发送中')
    await page.clock.runFor(2000)
    await expect.poll(() => polls).toBeGreaterThan(0)
    await page.clock.fastForward(61000)
    await expect(modal.getByRole('status')).toContainText('请勿重复发送')
    await expect(page.getByText('网络连接失败', { exact: true })).toHaveCount(0)
    await expect(
      page.locator('.ant-message').getByText('验证码已发送，请查收邮箱', { exact: true }),
    ).toHaveCount(0)
    expect(sends).toBe(1)
    await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
    expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`sending-${width}.png`),
      fullPage: true,
    })
    sent = true
    await page.clock.runFor(2000)
    await expect(modal.getByText('验证码发送至：p***@example.test')).toBeVisible()
    await expect(modal.getByRole('button', { name: /秒后重发$/ })).toBeDisabled()
    await expect(page.locator('.ant-message')).toContainText('验证码已发送，请查收邮箱')
    expect(sends).toBe(1)
    await expect(modal.getByLabel('图形验证码', { exact: true })).toHaveValue('A2BCD')
  })
}
