import { expect, test, type BrowserContext } from '@playwright/test'
import type { ServerMenu } from '../../src/shared/auth/types'
import project from '../../project.config.json' with { type: 'json' }

/** Exercise the real module/router/forms with the frozen HTTP contract, not a live payment service. */
async function membershipFixture(
  context: BrowserContext,
  admin: boolean | 'issue-only' = false,
) {
  let vip = false
  let redeemFailed = true
  let issued = false
  let status = 'UNUSED'
  let codeId = 'code-a'
  let deliveryStatus = 'SENDING'
  let deliveryTarget = 'SENT'
  const redeemIds: string[] = []
  const issueIds: string[] = []
  const issueBodies: Record<string, unknown>[] = []
  const reissueIds: string[] = []
  const retiredCodes: string[] = []
  const paths: string[] = []
  const packages = [
    { id: 'DAY', name: '日卡', days: 1, priceCents: 200 },
    { id: 'WEEK', name: '周卡', days: 7, priceCents: 400 },
    { id: 'MONTH', name: '月卡', days: 30, priceCents: 800 },
    { id: 'QUARTER', name: '季卡', days: 90, priceCents: 2000 },
  ]
  const menus: ServerMenu[] = [
    {
      id: 'member-center',
      code: 'membership/Center',
      name: '会员中心',
      url: '/membership',
      granted: true,
    },
    {
      id: 'gift-book',
      code: 'gift-registry/Event',
      name: '活动礼簿',
      url: '/gift-registry',
      granted: true,
    },
  ]
  if (admin)
    menus.push({
      id: 'member-admin',
      code: 'membership/Management',
      name: '会员管理',
      url: '/membership/manage',
      granted: true,
    })
  const event = {
    id: 'a',
    name: '喜宴',
    eventDate: '2026-11-20',
    eventType: 'WEDDING',
    description: '亲友欢聚',
    status: 'ACTIVE',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  const entry = {
    id: 'e1',
    eventId: 'a',
    seq: 1,
    name: '张三',
    amountCents: 10000,
    paymentMethod: 'CASH',
    attendeeCount: 1,
    remark: '',
    status: 'VALID',
    version: 1,
    requestId: 'original',
    createdAt: 1,
    updatedAt: 1,
  }
  const authorization = () => ({
    id: codeId,
    userId: 'member-a',
    username: 'member-a',
    packageId: 'DAY',
    days: 1,
    priceCents: 200,
    paymentReference: 'transfer-1',
    status,
    issuedAt: Date.now(),
    redeemedAt: null,
    issuerName: '管理员甲',
    recipientEmail: 'member@example.com',
    deliveryStatus,
  })
  await context.addInitScript(
    (namespace) =>
      localStorage.setItem(`${namespace}:token`, 'membership-test'),
    project.storageNamespace,
  )
  await context.route('http://127.0.0.1:5189/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    paths.push(path)
    const body = request.postData() ? request.postDataJSON() : undefined
    const send = (result: unknown, statusCode = 200, message?: string) =>
      route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify({
          success: statusCode < 400,
          status: statusCode,
          result,
          message,
        }),
      })
    const page = (data: unknown[]) =>
      send({
        data,
        total: data.length,
        pageIndex: body?.pageIndex || 0,
        pageSize: body?.pageSize || 20,
      })
    if (path === '/system/config/front') return send({})
    if (path === '/user/detail')
      return send({
        id: 'member-a',
        username: 'member-a',
        name: '用户甲',
        status: 1,
      })
    if (path === '/authorize/me')
      return send({
        permissions: [
          ...(!admin
            ? [{ id: 'membership', actions: ['query', 'redeem'] }]
            : []),
          {
            id: 'gift-registry',
            actions: ['query', 'save', 'export', 'backup', 'restore'],
          },
          ...(admin
            ? [
                {
                  id: 'membership-admin',
                  actions:
                    admin === 'issue-only'
                      ? ['issue']
                      : ['query', 'issue', 'revoke'],
                },
              ]
            : []),
        ],
      })
    if (path === '/menu/user-own/tree') return send(menus)
    if (path === '/membership/me')
      return send({
        state: vip ? 'VIP' : 'FREE',
        vip,
        unlimited: vip,
        expiresAt: vip ? Date.now() + 86400000 : null,
        serverTime: Date.now(),
      })
    if (
      path === '/membership/packages' ||
      path === '/membership/admin/packages'
    )
      return send(packages)
    if (path === '/membership/history/_query')
      return page(
        vip
          ? [
              {
                id: 'history-a',
                packageId: 'DAY',
                days: 1,
                priceCents: 200,
                beforeExpiresAt: null,
                afterExpiresAt: Date.now() + 86400000,
                redeemedAt: Date.now(),
              },
            ]
          : [],
      )
    if (path === '/membership/redeem') {
      redeemIds.push(body.requestId)
      if (redeemFailed) {
        redeemFailed = false
        return send(null, 503, '暂时无法处理，请重试')
      }
      vip = true
      return send({
        state: 'VIP',
        vip: true,
        unlimited: true,
        expiresAt: Date.now() + 86400000,
        serverTime: Date.now(),
      })
    }
    if (path === '/membership/admin/accounts/_query')
      return page([
        {
          userId: 'member-a',
          username: 'member-a',
          name: '用户甲',
          state: vip ? 'VIP' : 'FREE',
          expiresAt: null,
        },
      ])
    if (path === '/membership/admin/codes/_query')
      return page(issued ? [authorization()] : [])
    if (path === '/membership/admin/recipients/_query')
      return send(
        body.search.includes('nomail')
          ? [
              {
                userId: 'no-email',
                username: 'nomail',
                name: '未绑定用户',
                email: null,
              },
            ]
          : [
              {
                userId: 'member-a',
                username: 'member-a',
                name: '用户甲',
                email: 'member@example.com',
              },
            ],
      )
    if (/^\/membership\/admin\/codes\/[^/]+\/delivery$/.test(path)) {
      deliveryStatus = deliveryTarget
      return send({
        codeId,
        recipientEmail: 'member@example.com',
        deliveryStatus,
      })
    }
    if (path === '/membership/admin/codes') {
      issueIds.push(body.requestId)
      issueBodies.push(body)
      issued = true
      return send({
        authorization: authorization(),
        code: 'SECRET-ONE-TIME-CODE',
        replayed: false,
      })
    }
    if (path.endsWith('/reissue')) {
      reissueIds.push(body.requestId)
      retiredCodes.push(codeId)
      codeId = 'code-reissued'
      deliveryStatus = 'SENDING'
      return send({
        authorization: authorization(),
        code: 'REISSUED-ONE-TIME-CODE',
        replayed: false,
      })
    }
    if (path.endsWith('/revoke')) {
      status = 'REVOKED'
      return send(true)
    }
    if (path === '/gift-registry/usage') {
      const eventId = url.searchParams.get('eventId')
      return send({
        membership: {
          state: vip ? 'VIP' : 'FREE',
          vip,
          unlimited: vip,
          expiresAt: vip ? Date.now() + 86400000 : null,
          serverTime: Date.now(),
        },
        ownedActivityCount: 1,
        activityLimit: vip ? null : 1,
        canCreateEvent: vip,
        eventId,
        entryCount: eventId ? 10 : null,
        entryLimit: vip || !eventId ? null : 10,
        canCreateEntry: !!eventId && vip,
        ownerUnlimited: !!eventId && vip,
      })
    }
    if (path === '/gift-registry/events/_query') return page([event])
    if (path === '/gift-registry/events/a') return send(event)
    if (path === '/gift-registry/events/a/display-settings')
      return send({
        title: '喜宴',
        photoDataUrl: null,
        columnsPerPage: 12,
        version: 1,
      })
    if (path === '/gift-registry/events/a/summary')
      return send({
        totalEntries: 1,
        totalAmountCents: 10000,
        totalAttendees: 1,
        unregisteredAttendeeEntries: 0,
        cashAmountCents: 10000,
        wechatAmountCents: 0,
      })
    if (path === '/gift-registry/events/a/entries/_query') return page([entry])
    if (/^\/user\/settings\//.test(path)) return send([])
    return send(null, 404, `Unhandled ${path}`)
  })
  return {
    redeemIds,
    issueIds,
    issueBodies,
    reissueIds,
    retiredCodes,
    paths,
    setVip: (value: boolean) => {
      vip = value
    },
    setDeliveryTarget: (value: string) => {
      deliveryTarget = value
    },
  }
}

async function selectRecipient(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  search = 'member',
  label = 'member-a · 用户甲',
) {
  await dialog.getByLabel('用户名', { exact: true }).fill(search)
  await page.getByTitle(label, { exact: true }).click()
}

for (const width of [1440, 390]) {
  test(`membership countdown and payment fields at ${width}px`, async ({
    page,
    context,
  }) => {
    const state = await membershipFixture(context)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/membership')
    await expect(
      page.getByRole('heading', { name: '会员中心', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('免费账号', { exact: true })).toBeVisible()
    const countdown = page.locator('.membership-countdown')
    await expect(countdown).toHaveCount(0)
    const payment = page.locator('.membership-offline-payment')
    await expect(payment).toContainText('请在“填写信息”中填写用户名和邮箱地址')
    await expect(payment).not.toContainText('姓名')
    state.setVip(true)
    await page
      .locator('.membership-page .pro-page-header')
      .getByRole('button', { name: '刷新', exact: true })
      .click()
    await expect(countdown).toBeVisible()
    await expect(countdown).toHaveText(
      /距离到期时间还剩\d+天\d+小时\d+分钟\d+秒/,
    )
    const remaining = async () => {
      const parts = (await countdown.textContent())!.match(/\d+/g)!.map(Number)
      return parts[0]! * 86400 + parts[1]! * 3600 + parts[2]! * 60 + parts[3]!
    }
    const before = await remaining()
    const requests = state.paths.filter(
      (path) => path === '/membership/me',
    ).length
    await expect.poll(remaining).toBeLessThan(before)
    expect(
      state.paths.filter((path) => path === '/membership/me'),
    ).toHaveLength(requests)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/membership-countdown-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await expect(countdown).toHaveText(
      /Time remaining: \d+ days \d+ hours \d+ minutes \d+ seconds/,
    )
    await expect(payment).toContainText('enter your username and email address')
    await expect(payment).not.toContainText('enter your name,')
    expect(errors).toEqual([])
  })
  test(`membership redemption and quota controls at ${width}px`, async ({
    page,
    context,
  }) => {
    const state = await membershipFixture(context)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/gift-registry')
    await expect(
      page.getByRole('button', { name: '新建活动', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: '登记并继续', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: '编辑', exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '作废', exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '导出当前筛选全部明细', exact: true }),
    ).toBeDisabled()
    await expect(page.getByText('明细 10 / 10', { exact: true })).toBeVisible()
    await page.goto('/membership')
    await expect(
      page.getByRole('heading', { name: '会员中心', exact: true }),
    ).toBeVisible()
    await expect(page.locator('.membership-package')).toHaveCount(4)
    const code = page.getByLabel('授权码', { exact: true })
    await code.fill('issued-for-member-a')
    const redeem = page.getByRole('button', {
      name: '兑换授权码',
      exact: true,
    })
    await redeem.click()
    await expect(page.getByText('暂时无法处理，请重试').first()).toBeVisible()
    await expect(code).toHaveValue('issued-for-member-a')
    await redeem.click()
    await expect(page.getByText('兑换成功，会员权益已生效')).toBeVisible()
    await expect(code).toHaveValue('')
    expect(state.redeemIds).toHaveLength(2)
    expect(state.redeemIds[0]).toBe(state.redeemIds[1])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/membership-center-${width}.png`,
      fullPage: true,
    })
    await page.goto('/gift-registry')
    await expect(
      page.getByRole('button', { name: '新建活动', exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: '导出当前筛选全部明细', exact: true }),
    ).toBeEnabled()
  })
  test(`administrator issues a one-time code using admin-only grants at ${width}px`, async ({
    page,
    context,
  }) => {
    const state = await membershipFixture(context, true)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/membership/manage')
    await page.getByRole('button', { name: '核款并发码', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await selectRecipient(page, dialog)
    await expect(dialog.getByLabel('收件邮箱', { exact: true })).toHaveValue(
      'member@example.com',
    )
    await expect(
      dialog.getByLabel('收件邮箱', { exact: true }),
    ).toHaveAttribute('readonly', '')
    await dialog.getByLabel('套餐', { exact: true }).click()
    await page.getByTitle('日卡 · ¥2.00 · 1 天', { exact: true }).click()
    await dialog.getByLabel('收款参考号', { exact: true }).fill('transfer-1')
    await dialog
      .getByRole('button', { name: '核款并发码', exact: true })
      .click()
    const result = page.getByRole('dialog', { name: '本次授权码' })
    await expect(result.getByLabel('授权码')).toHaveValue(
      'SECRET-ONE-TIME-CODE',
    )
    await expect(result.getByText('发送中', { exact: true })).toBeVisible()
    await expect(result.getByText('已发送', { exact: true })).toBeVisible()
    expect(state.issueBodies[0]?.email).toBe('member@example.com')
    await result.getByRole('button', { name: '已保存，关闭' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain('SECRET-ONE-TIME-CODE')
    await expect(
      page.getByRole('cell', { name: 'member-a', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await page.getByRole('button', { name: '确定', exact: true }).click()
    await expect(
      page.getByRole('cell', { name: '已撤销', exact: true }),
    ).toBeVisible()
    expect(state.issueIds).toHaveLength(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/membership-management-${width}.png`,
      fullPage: true,
    })
    expect(errors).toEqual([])
  })
}

test('issue-only operator can select a verified recipient and observe delivery without reading account or code lists', async ({
  page,
  context,
}) => {
  const state = await membershipFixture(context, 'issue-only')
  await page.goto('/membership/manage')
  await page.getByRole('button', { name: '核款并发码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await selectRecipient(page, dialog)
  await dialog.getByLabel('套餐', { exact: true }).click()
  await page.getByTitle('日卡 · ¥2.00 · 1 天', { exact: true }).click()
  await dialog.getByLabel('收款参考号', { exact: true }).fill('transfer-1')
  await dialog.getByRole('button', { name: '核款并发码', exact: true }).click()
  const result = page.getByRole('dialog', { name: '本次授权码' })
  await expect(result.getByText('已发送', { exact: true })).toBeVisible()
  expect(state.paths).not.toContain('/membership/admin/accounts/_query')
  expect(state.paths).not.toContain('/membership/admin/codes/_query')
  expect(state.paths.some((path) => path === '/user/_query')).toBe(false)
  expect(state.paths).toContain('/membership/admin/recipients/_query')
  expect(state.paths).toContain('/membership/admin/codes/code-a/delivery')
})

test('missing verified email blocks issuance and failed email supports copying or reissue from the same payment at 390px', async ({
  page,
  context,
}) => {
  const state = await membershipFixture(context, true)
  state.setDeliveryTarget('FAILED')
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/membership/manage')
  await page.getByRole('button', { name: '核款并发码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await selectRecipient(
    page,
    dialog,
    'nomail',
    'nomail · 未绑定用户 · 未绑定已验证邮箱',
  )
  await expect(dialog.getByLabel('收件邮箱', { exact: true })).toHaveValue('')
  await expect(
    dialog.getByRole('button', { name: '核款并发码', exact: true }),
  ).toBeDisabled()
  expect(state.issueIds).toHaveLength(0)
  await selectRecipient(page, dialog)
  await dialog.getByLabel('套餐', { exact: true }).click()
  await page.getByTitle('日卡 · ¥2.00 · 1 天', { exact: true }).click()
  await dialog.getByLabel('收款参考号', { exact: true }).fill('transfer-1')
  await dialog.getByRole('button', { name: '核款并发码', exact: true }).click()
  const result = page.getByRole('dialog', { name: '本次授权码' })
  await expect(result.getByText('发送失败', { exact: true })).toBeVisible()
  await expect(
    result.getByText(/已核款并生成授权码，但邮件未送达/),
  ).toBeVisible()
  await expect(result.getByLabel('授权码')).toHaveValue('SECRET-ONE-TIME-CODE')
  await expect(
    result.getByRole('button', { name: '复制授权码', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByText('授权码邮件已发送，请以收件箱实际接收为准', { exact: true }),
  ).toHaveCount(0)
  await result.getByRole('button', { name: '已保存，关闭' }).click()
  await expect(
    page.getByRole('cell', { name: '发送失败', exact: true }),
  ).toBeVisible()
  state.setDeliveryTarget('SENT')
  await page.getByRole('button', { name: '补发', exact: true }).click()
  await page.mouse.move(0, 0)
  await expect(page.getByText(/补发会立即作废原未使用码/)).toBeVisible()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(result.getByLabel('授权码')).toHaveValue(
    'REISSUED-ONE-TIME-CODE',
  )
  await expect(result.getByText('已发送', { exact: true })).toBeVisible()
  expect(state.issueIds).toHaveLength(1)
  expect(state.reissueIds).toHaveLength(1)
  expect(state.retiredCodes).toEqual(['code-a'])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'test-results/membership-delivery-fallback-390.png',
    fullPage: true,
  })
})
