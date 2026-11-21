import { expect, test, type BrowserContext } from '@playwright/test'
import project from '../../project.config.json' with { type: 'json' }

type Identity = 'EXEMPT' | 'FREE' | 'VIP' | 'ALL'
const creatorName = '创建用户姓名很长但应完整保留并可通过悬浮查看'.repeat(5)
const createdAt = Date.UTC(2026, 10, 21, 1, 2, 3)
test.use({ timezoneId: 'Asia/Shanghai' })

/** Real list components consume the actor identity separately from data scope and owner quotas. */
async function fixture(context: BrowserContext, identity: Identity) {
  const state = identity === 'ALL' ? 'FREE' : identity
  const membership = {
    state,
    vip: state === 'VIP',
    unlimited: state === 'VIP' || state === 'EXEMPT',
    expiresAt: state === 'VIP' ? Date.now() + 86400000 : null,
    serverTime: Date.now(),
  }
  const event = {
    id: 'event-a',
    name: '创建用户列验证活动',
    eventDate: '2026-11-21',
    eventType: 'WEDDING',
    description: '管理列表范围保持原样',
    status: 'ACTIVE',
    version: 1,
    createdAt,
    updatedAt: 1,
    creatorName,
  }
  const entry = {
    id: 'entry-a',
    eventId: event.id,
    seq: 1,
    name: '原始登记宾客',
    amountCents: 10000,
    paymentMethod: 'CASH',
    attendeeCount: 1,
    remark: '备注',
    status: 'VALID',
    version: 1,
    requestId: 'entry-request',
    createdAt,
    updatedAt: 1,
    creatorName,
  }
  await context.addInitScript(
    (namespace) => localStorage.setItem(`${namespace}:token`, 'creator-test'),
    project.storageNamespace,
  )
  await context.route('http://127.0.0.1:5189/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    const send = (result: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ success: status < 400, status, result }),
      })
    const page = (data: unknown[]) =>
      send({ data, total: data.length, pageIndex: 0, pageSize: 20 })
    if (path === '/system/config/front') return send({})
    if (path === '/user/detail')
      return send({
        id: `actor-${identity}`,
        username: `actor-${identity}`,
        name: '当前操作人',
        status: 1,
        roleList:
          identity === 'ALL' ? [{ id: 'ADMIN', name: '超级管理员' }] : [],
      })
    if (path === '/authorize/me')
      return send({
        permissions: [
          {
            id: 'gift-registry',
            actions: ['query'],
            dataAccesses: [
              {
                action: 'query',
                type: identity === 'ALL' ? 'all' : 'creator',
                config: {},
              },
            ],
          },
        ],
      })
    if (path === '/menu/user-own/tree')
      return send([
        {
          id: 'manage',
          code: 'gift-registry/Manage',
          name: '活动管理',
          url: '/gift-registry/events',
          granted: true,
        },
        {
          id: 'book',
          code: 'gift-registry/Event',
          name: '活动礼簿',
          url: '/gift-registry',
          granted: true,
        },
      ])
    if (path === '/gift-registry/usage')
      return send({
        membership,
        ownedActivityCount: 2,
        activityLimit: membership.unlimited ? null : 1,
        canCreateEvent: membership.unlimited,
        eventId: url.searchParams.get('eventId'),
        entryCount: 2,
        entryLimit: null,
        canCreateEntry: true,
        // Deliberately true for every actor: an unlimited owner must never reveal this column.
        ownerUnlimited: true,
      })
    if (path === '/gift-registry/events/_query')
      return page([
        event,
        {
          ...event,
          id: 'event-b',
          name: '缺失创建用户活动',
          creatorName: null,
          createdAt: null,
        },
      ])
    if (path === '/gift-registry/events/event-a') return send(event)
    if (path === '/gift-registry/events/event-a/display-settings')
      return send({
        title: event.name,
        photoDataUrl: null,
        columnsPerPage: 12,
        version: 1,
      })
    if (path === '/gift-registry/events/event-a/summary')
      return send({
        totalEntries: 2,
        totalAmountCents: 20000,
        totalAttendees: 2,
        cashAmountCents: 20000,
        wechatAmountCents: 0,
        unregisteredAttendeeEntries: 0,
      })
    if (path === '/gift-registry/events/event-a/entries/_query')
      return page([
        entry,
        {
          ...entry,
          id: 'entry-b',
          seq: 2,
          name: '缺失创建用户宾客',
          creatorName: null,
          createdAt: null,
        },
      ])
    if (path.startsWith('/user/settings/')) return send([])
    return send(null, 404)
  })
}

for (const width of [1440, 390]) {
  for (const identity of ['EXEMPT', 'FREE', 'VIP', 'ALL'] as const) {
    test(`creator columns use actor ${identity} at ${width}px`, async ({
      page,
      context,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning')
          errors.push(message.text())
      })
      await fixture(context, identity)
      await page.setViewportSize({ width, height: 1000 })
      for (const [path, rowName, emptyRowName] of [
        ['/gift-registry/events', '创建用户列验证活动', '缺失创建用户活动'],
        ['/gift-registry?eventId=event-a', '原始登记宾客', '缺失创建用户宾客'],
      ]) {
        await page.goto(path!)
        const table = page.locator('.ant-table')
        const row = table.getByRole('row').filter({
          has: page.getByRole('cell', { name: rowName!, exact: true }),
        })
        await expect(row).toBeVisible()
        const header = table.locator('.ant-table-thead').getByText('创建用户', {
          exact: true,
        })
        const emptyRow = table.getByRole('row').filter({
          has: page.getByRole('cell', { name: emptyRowName!, exact: true }),
        })
        if (identity === 'EXEMPT') {
          await expect(header).toHaveCount(1)
          const value = row
            .getByRole('cell', { name: creatorName, exact: true })
            .locator('.ellipsis')
          await expect(value).toHaveText(creatorName)
          await value.scrollIntoViewIfNeeded()
          expect(
            await value.evaluate((element) => {
              const style = getComputedStyle(element)
              return (
                style.whiteSpace === 'nowrap' &&
                style.textOverflow === 'ellipsis' &&
                element.scrollWidth > element.clientWidth
              )
            }),
          ).toBe(true)
          await expect(
            emptyRow
              .locator('td')
              .nth(
                (await table.locator('.ant-table-thead th').allTextContents())
                  .indexOf('创建用户'),
              ),
          ).toHaveText('--')
          await value.hover()
          await expect(
            page.getByRole('tooltip').filter({ hasText: creatorName }),
          ).toBeVisible()
          await page.mouse.move(0, 0)
          await expect(
            page.getByRole('tooltip').filter({ hasText: creatorName }),
          ).toBeHidden()
          if (width === 1440) {
            await page
              .getByRole('button', { name: '语言', exact: true })
              .click()
            await expect(
              table.locator('.ant-table-thead').getByText('Created by', {
                exact: true,
              }),
            ).toHaveCount(1)
            expect(
              (
                await table.locator('.ant-table-thead th').allTextContents()
              ).slice(-3),
            ).toEqual(['Created at', 'Created by', 'Actions'])
            await page
              .getByRole('button', { name: 'Language', exact: true })
              .click()
          }
        } else {
          await expect(header).toHaveCount(0)
          await expect(
            table.getByText(creatorName, { exact: true }),
          ).toHaveCount(0)
        }
        const expectedHeaders =
          path === '/gift-registry/events'
            ? [
                '活动名称',
                '活动类型与样式',
                '活动日期',
                '活动状态',
                '活动描述',
                '创建时间',
              ]
            : [
                '序号',
                '宾客姓名',
                '礼金金额（元）',
                '支付方式',
                '到场人数',
                '备注',
                '状态',
                '创建时间',
              ]
        if (identity === 'EXEMPT') expectedHeaders.push('创建用户')
        expectedHeaders.push('操作')
        await expect(table.locator('.ant-table-thead th')).toHaveText(
          expectedHeaders,
        )
        const timeIndex = expectedHeaders.indexOf('创建时间')
        const timeCell = row.locator('td').nth(timeIndex)
        await expect(timeCell).toHaveText('2026-11-21 09:02:03')
        await expect(emptyRow.locator('td').nth(timeIndex)).toHaveText('--')
        expect(
          await timeCell.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return range.getClientRects().length
          }),
        ).toBe(1)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        if (path === '/gift-registry/events') {
          expect((await row.boundingBox())!.height).toBeLessThan(150)
          if (width === 390)
            expect(
              await table
                .locator('.ant-table-content')
                .evaluate(
                  (element) => element.scrollWidth > element.clientWidth,
                ),
            ).toBe(true)
        }
        await timeCell.scrollIntoViewIfNeeded()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: test
            .info()
            .outputPath(
              `creator-${identity}-${path!.startsWith('/gift-registry/events') ? 'events' : 'entries'}-${width}.png`,
            ),
          fullPage: true,
        })
      }
      expect(errors).toEqual([])
    })
  }
}
