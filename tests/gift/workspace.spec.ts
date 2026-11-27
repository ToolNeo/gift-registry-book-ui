import { expect, test, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { ServerMenu } from '../../src/shared/auth/types'
import project from '../../project.config.json' with { type: 'json' }
import type {
  BackupBundle,
  DisplaySettings,
  EntryAudit,
  GiftEntry,
  GiftEvent,
} from '../../src/modules/gift-registry-manager-ui/types'

const photo = '/api/file/static/20261127/activity.png'
const embeddedPhoto =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII='
const photoBytes = Buffer.from(embeddedPhoto.split(',')[1]!, 'base64')

/** Browser fixtures exercise the real router/forms/HTTP clients while recording the frozen backend contract. */
async function fixture(
  context: BrowserContext,
  actions = ['query', 'save', 'export', 'backup', 'restore'],
  menus: ServerMenu[] = [
    {
      id: 'configured-activity-management',
      code: 'gift-registry/Manage',
      name: '活动管理',
      url: '/gift-registry/events',
      granted: true,
    },
  ],
) {
  let counter = 0
  let offline = false
  let exportRejected = false
  let tokenCounter = 0
  const issuedTokens = new Map<string, Set<string>>()
  const tokens = new Map([
    ['a', 'display-a'],
    ['b', 'display-b'],
  ])
  const webSocketAttempts: string[] = []
  const savedQueries = new Map<
    string,
    { key: string; name: string; content: string }[]
  >()
  const events: GiftEvent[] = ['a', 'b'].map((id) => ({
    id,
    name: `活动${id.toUpperCase()}`,
    eventDate: '2026-10-19',
    eventType: 'WEDDING',
    description: '',
    status: 'ACTIVE',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  }))
  const entries: GiftEntry[] = []
  const audits: EntryAudit[] = []
  const settings = new Map<string, DisplaySettings>(
    events.map((event) => [
      event.id,
      { title: event.name, photoUrl: null, columnsPerPage: 12, version: 1 },
    ]),
  )
  const requests: {
    path: string
    method: string
    body: unknown
    headers: Record<string, string>
  }[] = []
  const addEntry = (eventId: string, input: Partial<GiftEntry>) => {
    const event = events.find((item) => item.id === eventId)!
    const entry: GiftEntry = {
      id: `e${++counter}`,
      eventId,
      seq: entries.filter((item) => item.eventId === eventId).length + 1,
      name: '宾客',
      amountCents: 123,
      paymentMethod: 'CASH',
      attendeeCount: null,
      remark: '',
      status: 'VALID',
      version: 1,
      requestId: `request-${counter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...input,
    }
    entries.push(entry)
    event.version++
    return entry
  }
  await context.addInitScript((namespace) => {
    if (window.location.origin === 'http://127.0.0.1:5189')
      localStorage.setItem(`${namespace}:token`, 'management-token')
  }, project.storageNamespace)
  await context.routeWebSocket(
    /\/api\/gift-registry\/display\/[^/]+\/live$/,
    (socket) => {
      webSocketAttempts.push(socket.url())
      socket.close({ code: 1008, reason: 'Unexpected WebSocket' })
    },
  )
  await context.route('http://127.0.0.1:5189/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url()),
      path = url.pathname.replace(/^\/api/, ''),
      method = request.method()
    const multipart = request
      .headers()
      ['content-type']?.startsWith('multipart/form-data')
    let body =
      request.postData() && !multipart ? request.postDataJSON() : undefined
    if (multipart) {
      const raw = request.postDataBuffer()!.toString('utf8')
      const settingsPart = raw.match(
        /name="settings"[^\r\n]*\r\nContent-Type: application\/json\r\n\r\n([^\r\n]*)/i,
      )
      body = JSON.parse(settingsPart![1]!)
    }
    requests.push({ path, method, body, headers: request.headers() })
    const send = (result: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          success: status < 400,
          status,
          result,
          message: status >= 400 ? 'Access denied' : undefined,
        }),
      })
    if (path === '/file/static/20261127/activity.png')
      return route.fulfill({ contentType: 'image/png', body: photoBytes })
    if (path === '/system/config/front') return send({})
    if (path === '/user/detail')
      return send({
        id: 'admin',
        username: 'admin',
        name: '记账员',
        status: 1,
      })
    if (path === '/authorize/me')
      return send({
        permissions: [
          { id: 'gift-registry', actions },
          { id: 'membership', actions: ['query', 'redeem'] },
        ],
      })
    if (path === '/menu/user-own/tree') return send(menus)
    if (path === '/membership/me')
      return send({
        state: 'EXEMPT',
        vip: false,
        unlimited: true,
        expiresAt: null,
        serverTime: Date.now(),
      })
    if (path === '/membership/packages') return send([])
    if (path === '/gift-registry/usage') {
      const eventId = url.searchParams.get('eventId')
      return send({
        membership: {
          state: 'EXEMPT',
          vip: false,
          unlimited: true,
          expiresAt: null,
          serverTime: Date.now(),
        },
        ownedActivityCount: events.length,
        activityLimit: null,
        canCreateEvent: true,
        eventId,
        entryCount: eventId
          ? entries.filter((item) => item.eventId === eventId).length
          : null,
        entryLimit: null,
        canCreateEntry: !!eventId,
        ownerUnlimited: !!eventId,
      })
    }
    const history = path.match(
      /^\/user\/settings\/(gift-registry-(?:entries|events))(?:\/([^/]+))?$/,
    )
    if (history) {
      const records = savedQueries.get(history[1]!) || []
      if (method === 'POST')
        records.push({ key: String(records.length + 1), ...body })
      if (method === 'DELETE') {
        const index = records.findIndex((row) => row.key === history[2])
        if (index >= 0) records.splice(index, 1)
      }
      savedQueries.set(history[1]!, records)
      return send(records)
    }
    if (
      path === '/gift-registry/events/_query' &&
      (body.paging !== true || body.pageSize > 200)
    )
      return send(null, 400)
    if (path === '/gift-registry/events/_query') {
      let rows = events.slice()
      for (const term of body.terms || []) {
        if (term.column === 'name')
          rows = rows.filter((event) =>
            event.name.includes(String(term.value).replaceAll('%', '')),
          )
        if (term.column === 'status')
          rows = rows.filter((event) => event.status === term.value)
      }
      return send({
        data: rows.slice(
          body.pageIndex * body.pageSize,
          (body.pageIndex + 1) * body.pageSize,
        ),
        total: rows.length,
        pageIndex: body.pageIndex,
        pageSize: body.pageSize,
      })
    }
    if (path === '/gift-registry/events' && method === 'POST') {
      if (
        ![
          'WEDDING',
          'FUNERAL',
          'BIRTHDAY',
          'FULL_MOON',
          'HUNDRED_DAYS',
          'FIRST_BIRTHDAY',
          'ENGAGEMENT',
          'HOUSEWARMING',
          'GRADUATION',
          'BUSINESS_OPENING',
        ].includes(body.eventType) ||
        !body.description?.trim() ||
        body.description.trim().length > 1024
      )
        return send(null, 400)
      const event = {
        ...events[0]!,
        ...body,
        id: `event${++counter}`,
        version: 1,
      }
      events.push(event)
      settings.set(event.id, {
        title: event.name,
        photoUrl: null,
        columnsPerPage: 12,
        version: 1,
      })
      return send(event)
    }
    if (path === '/gift-registry/events/_restore') {
      const event = {
        ...body.event,
        id: `restored${++counter}`,
        name: `${body.event.name}（恢复）`,
        version: 1,
        eventType: body.event.eventType || 'WEDDING',
        description: body.event.description || '',
      }
      events.push(event)
      const { photoDataUrl, ...restoredSettings } = body.settings
      settings.set(event.id, {
        ...restoredSettings,
        photoUrl: photoDataUrl ? photo : null,
      })
      for (const item of body.entries)
        addEntry(event.id, {
          ...item,
          id: `restored-entry${++counter}`,
          eventId: event.id,
        })
      return send(event)
    }
    const display = path.match(
      /^\/gift-registry\/display\/([^/]+)\/(version|snapshot)$/,
    )
    if (display) {
      if (offline) return route.abort('failed')
      const token = request.headers()['x-gift-display-token'] || ''
      if (
        token !== tokens.get(display[1]!) &&
        !issuedTokens.get(display[1]!)?.has(token)
      )
        return send(null, 403)
      const event = events.find((item) => item.id === display[1])
      if (!event) return send(null, 404)
      if (display[2] === 'version') return send({ version: event.version })
      const rows = entries
        .filter((item) => item.eventId === event.id && item.status === 'VALID')
        .sort((a, b) => a.seq - b.seq)
      const config = settings.get(event.id)!
      const pageSize = Math.min(
        config.columnsPerPage,
        Number(url.searchParams.get('pageSize') || config.columnsPerPage),
      )
      const requested = Number(url.searchParams.get('pageIndex') || 0)
      const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1)
      const pageIndex =
        requested === -1 ? lastPage : Math.max(0, Math.min(requested, lastPage))
      return send({
        event: {
          id: event.id,
          name: event.name,
          eventDate: event.eventDate,
          eventType: event.eventType,
          description: event.description,
        },
        settings: config,
        version: event.version,
        latestEntrySeq: Math.max(
          0,
          ...entries
            .filter((entry) => entry.eventId === event.id)
            .map((entry) => entry.seq),
        ),
        entries: rows
          .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
          .map(({ id, seq, name, amountCents }) => ({
            id,
            seq,
            name,
            amountCents,
          })),
        total: rows.length,
        pageIndex,
        pageSize,
      })
    }
    const scoped = path.match(/^\/gift-registry\/events\/([^/]+)(.*)$/)
    if (!scoped) return send(null, 404)
    const [, id, suffix] = scoped
    const event = events.find((item) => item.id === id)!
    if (!event) return send(null, 404)
    if (!suffix) {
      if (method === 'DELETE') {
        if (!actions.includes('delete')) return send(null, 403)
        if (
          event.status !== 'CLOSED' ||
          Number(url.searchParams.get('expectedVersion')) !== event.version
        )
          return send(null, 409)
        events.splice(events.indexOf(event), 1)
        for (const rows of [entries, audits])
          for (let index = rows.length - 1; index >= 0; index--)
            if (rows[index]!.eventId === id) rows.splice(index, 1)
        settings.delete(id!)
        tokens.delete(id!)
        issuedTokens.delete(id!)
        return send(true)
      }
      if (method === 'PUT') {
        if (!actions.includes('save')) return send(null, 403)
        if (!body.description?.trim() || body.expectedVersion !== event.version)
          return send(null, 409)
        Object.assign(event, body, { version: event.version + 1 })
      }
      return send(event)
    }
    if (suffix === '/display-settings/photo') {
      if (!actions.includes('save')) return send(null, 403)
      if (
        !multipart ||
        !body.title?.trim() ||
        body.expectedVersion !== settings.get(id!)!.version
      )
        return send(null, 409)
      event.version++
      settings.set(id!, { ...body, photoUrl: photo, version: event.version })
      return send(settings.get(id!))
    }
    if (suffix === '/display-settings') {
      if (method === 'PUT') {
        if (!body.title?.trim() || body.title.trim().length > 128)
          return send(null, 400)
        event.version++
        settings.set(id!, {
          ...body,
          title: body.title.trim(),
          version: event.version,
        })
      }
      return send(settings.get(id!))
    }
    if (suffix === '/display-token/_issue') {
      const token = `display-${id}-issued-${++tokenCounter}`
      const valid = issuedTokens.get(id!) || new Set<string>()
      if (valid.size >= 100) return send(null, 409)
      valid.add(token)
      issuedTokens.set(id!, valid)
      return send({ token })
    }
    if (suffix === '/display-token/_rotate') {
      const token = `display-${id}-rotated-${++tokenCounter}`
      tokens.set(id!, token)
      issuedTokens.set(id!, new Set())
      return send({ token })
    }
    if (suffix === '/duplicate-names')
      return send(
        entries.filter(
          (item) =>
            item.eventId === id &&
            item.name === url.searchParams.get('name') &&
            item.id !== url.searchParams.get('excludeEntryId'),
        ),
      )
    if (suffix === '/summary') {
      const rows = entries.filter(
        (item) => item.eventId === id && item.status === 'VALID',
      )
      return send({
        totalAmountCents: rows.reduce((sum, item) => sum + item.amountCents, 0),
        totalEntries: rows.length,
        cashAmountCents: rows
          .filter((item) => item.paymentMethod === 'CASH')
          .reduce((sum, item) => sum + item.amountCents, 0),
        wechatAmountCents: rows
          .filter((item) => item.paymentMethod === 'WECHAT')
          .reduce((sum, item) => sum + item.amountCents, 0),
        totalAttendees: rows.reduce(
          (sum, item) => sum + (item.attendeeCount || 0),
          0,
        ),
        unregisteredAttendeeEntries: rows.filter(
          (item) => item.attendeeCount === null,
        ).length,
      })
    }
    if (suffix === '/entries/_query') {
      let rows = entries.filter((item) => item.eventId === id)
      for (const term of body.terms || []) {
        if (term.column === 'name')
          rows = rows.filter((item) =>
            item.name.includes(String(term.value).replaceAll('%', '')),
          )
        if (term.column === 'paymentMethod')
          rows = rows.filter((item) => item.paymentMethod === term.value)
        if (term.column === 'status')
          rows = rows.filter((item) => item.status === term.value)
      }
      rows.sort((a, b) => b.seq - a.seq)
      return send({
        data: rows.slice(
          body.pageIndex * body.pageSize,
          (body.pageIndex + 1) * body.pageSize,
        ),
        total: rows.length,
        pageIndex: body.pageIndex,
        pageSize: body.pageSize,
      })
    }
    if (suffix === '/entries/_export') {
      if (exportRejected) return send(null, 413)
      return route.fulfill({
        status: 200,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: {
          'content-disposition': 'attachment; filename="gift-entries.xlsx"',
          'cache-control': 'no-store',
        },
        body: await readFile(
          new URL('./fixtures/gift-entries.xlsx', import.meta.url),
        ),
      })
    }
    if (suffix === '/entries' && method === 'POST') {
      const existing = entries.find(
        (item) => item.eventId === id && item.requestId === body.requestId,
      )
      if (existing) return send(existing)
      const entry = addEntry(id!, body)
      audits.push({
        id: `audit${counter}`,
        entryId: entry.id,
        eventId: id!,
        action: 'CREATE',
        beforeJson: null,
        afterJson: JSON.stringify(entry),
        actorId: 'admin',
        actorName: '记账员',
        reason: null,
        createdAt: Date.now(),
      })
      return send(entry)
    }
    const entryMatch = suffix?.match(/^\/entries\/([^/]+)(.*)$/)
    if (entryMatch) {
      const entry = entries.find((item) => item.id === entryMatch[1])!
      if (entryMatch[2] === '/audit')
        return send(audits.filter((item) => item.entryId === entry.id))
      const beforeJson = JSON.stringify(entry)
      Object.assign(
        entry,
        entryMatch[2] === '/_void' ? { status: 'VOID' } : body,
        { version: entry.version + 1 },
      )
      event.version++
      audits.push({
        id: `audit${++counter}`,
        entryId: entry.id,
        eventId: id!,
        action: entryMatch[2] === '/_void' ? 'VOID' : 'UPDATE',
        beforeJson,
        afterJson: JSON.stringify(entry),
        actorId: 'admin',
        actorName: '记账员',
        reason: body.reason,
        createdAt: Date.now(),
      })
      return send(entry)
    }
    if (suffix === '/backup')
      return send({
        schemaVersion: 2,
        event,
        settings: {
          title: settings.get(id!)!.title,
          columnsPerPage: settings.get(id!)!.columnsPerPage,
          photoDataUrl: settings.get(id!)!.photoUrl ? embeddedPhoto : null,
          version: settings.get(id!)!.version,
        },
        entries: entries.filter((item) => item.eventId === id),
        audits: audits.filter((item) => item.eventId === id),
      } satisfies BackupBundle)
    return send(null, 404)
  })
  return {
    setExportRejected(value: boolean) {
      exportRejected = value
    },
    events,
    menus,
    tokens,
    entries,
    settings,
    audits,
    issuedTokens,
    requests,
    webSocketAttempts,
    addEntry,
    setOffline(value: boolean) {
      offline = value
    },
  }
}

async function register(
  page: import('@playwright/test').Page,
  name: string,
  amount: string,
  count?: string,
) {
  await page.locator('.gift-workspace').getByTestId('entry-name').fill(name)
  await page.locator('.gift-workspace').getByTestId('entry-amount').fill(amount)
  if (count !== undefined)
    await page
      .locator('.gift-workspace')
      .getByTestId('entry-attendees')
      .fill(count)
  await page.getByRole('button', { name: '登记并继续', exact: true }).click()
}

/** Check connected rules and text geometry after the complete book has fitted its viewport. */
async function expectGiftBand(
  page: import('@playwright/test').Page,
  count = 12,
) {
  const capacity = await page
    .locator('.gift-display-book')
    .evaluate((element) => {
      const width = element.getBoundingClientRect().width
      const left = Math.max(
        width <= 760 ? 105 : 110,
        width * (width <= 760 ? 0.3 : 0.22),
      )
      return Math.max(1, Math.min(24, Math.floor((width - 16 - left) / 100)))
    })
  count = Math.min(count, capacity)
  await expect(page.locator('.gift-book-label-cell')).toHaveCount(count)
  await expect(page.locator('.gift-book-seq')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const book = document
          .querySelector('.gift-book')!
          .getBoundingClientRect()
        const frame = document
          .querySelector('.gift-display-book')!
          .getBoundingClientRect()
        return (
          book.left >= frame.left - 1 &&
          book.right <= frame.right + 1 &&
          Math.abs(book.top - frame.top) <= 1 &&
          Math.abs(book.bottom - frame.bottom) <= 1
        )
      }),
    )
    .toBe(true)
  const band = await page.evaluate(() => {
    const book = document.querySelector<HTMLElement>('.gift-book')!
    const bookRect = book.getBoundingClientRect()
    const scale = bookRect.width / book.offsetWidth
    const innerRight =
      bookRect.right -
      parseFloat(getComputedStyle(book).borderRightWidth) * scale
    const innerTop =
      bookRect.top + parseFloat(getComputedStyle(book).borderTopWidth) * scale
    const innerBottom =
      bookRect.bottom -
      parseFloat(getComputedStyle(book).borderBottomWidth) * scale
    const pages = document.querySelector<HTMLElement>('.gift-book-pages')!
    const pagesRight = document
      .querySelector('.gift-book-pages')!
      .getBoundingClientRect().right
    const columns = document
      .querySelector('.gift-book-columns')!
      .getBoundingClientRect()
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>('.gift-book-label-cell'),
    )
    const boxes = cells.map((cell) => {
      const rect = cell.getBoundingClientRect(),
        style = getComputedStyle(cell)
      const label = cell
        .querySelector('.gift-book-label')
        ?.getBoundingClientRect()
      const name = cell
        .parentElement!.querySelector('.gift-book-name')
        ?.getBoundingClientRect()
      const amount = cell
        .parentElement!.querySelector('.gift-book-amount')
        ?.getBoundingClientRect()
      const number = cell.parentElement!.querySelector<HTMLElement>(
        '.gift-book-amount-number',
      )
      const column = cell.parentElement!.getBoundingClientRect()
      const numberCell = cell.parentElement!.querySelector(
        '.gift-book-number-cell',
      )!
      const numberCellRect = numberCell.getBoundingClientRect()
      let numeric
      if (number) {
        const box = number.getBoundingClientRect()
        const text = document.createRange()
        text.selectNodeContents(number)
        const writing = text.getBoundingClientRect(),
          numberStyle = getComputedStyle(number)
        numeric = {
          text: number.textContent!.trim(),
          mode: numberStyle.writingMode,
          size: parseFloat(numberStyle.fontSize),
          top: box.top,
          bottom: box.bottom,
          amountBottom: amount!.bottom,
          columnBottom: column.bottom,
          centerOffset: Math.abs(
            (writing.left + writing.right - box.left - box.right) / 2,
          ),
          clipped: number.scrollWidth > number.clientWidth,
          left: writing.left,
          right: writing.right,
          viewportLeft: box.left,
          viewportRight: box.right,
        }
      }
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        borderTop: parseFloat(style.borderTopWidth),
        borderBottom: parseFloat(style.borderBottomWidth),
        borderLeft: parseFloat(style.borderLeftWidth),
        borderRight: parseFloat(style.borderRightWidth),
        color: style.borderTopColor,
        labelTop: label?.top,
        labelBottom: label?.bottom,
        centerOffsetX: label
          ? Math.abs((label.left + label.right - rect.left - rect.right) / 2)
          : 0,
        centerOffsetY: label
          ? Math.abs((label.top + label.bottom - rect.top - rect.bottom) / 2)
          : 0,
        nameBottom: name?.bottom,
        amountTop: amount?.top,
        columnTop: column.top,
        columnBottom: column.bottom,
        numberRule: parseFloat(getComputedStyle(numberCell).borderTopWidth),
        numberColor: getComputedStyle(numberCell).borderTopColor,
        numberRuleLeft: numberCellRect.left,
        numberRuleRight: numberCellRect.right,
        numberRuleTop: numberCellRect.top,
        numeric,
      }
    })
    const probe = document.createElement('span')
    probe.style.color = getComputedStyle(
      document.querySelector('.gift-book')!,
    ).getPropertyValue('--book-rule')
    document.body.append(probe)
    const ruleColor = getComputedStyle(probe).color
    probe.remove()
    return {
      boxes,
      left: columns.left,
      right: columns.right,
      ruleColor,
      innerRight,
      pagesRight,
      innerTop,
      innerBottom,
      scale,
      pagesOverflow: pages.scrollWidth > pages.clientWidth + 1,
    }
  })
  expect(band.boxes).toHaveLength(count)
  expect(band.pagesOverflow).toBe(false)
  expect(Math.abs(band.pagesRight - band.innerRight)).toBeLessThanOrEqual(1)
  expect(
    Math.abs(band.boxes.at(-1)!.right - band.innerRight),
  ).toBeLessThanOrEqual(1)
  expect(Math.abs(band.boxes[0]!.left - band.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(band.boxes.at(-1)!.right - band.right)).toBeLessThanOrEqual(1)
  expect(band.boxes[0]!.borderLeft).toBe(1)
  expect(band.boxes.at(-1)!.borderRight).toBe(1)
  for (const [index, cell] of band.boxes.entries()) {
    expect(Math.abs(cell.columnTop - band.innerTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.columnBottom - band.innerBottom)).toBeLessThanOrEqual(
      1,
    )
    expect(cell.numberRule).toBe(1)
    expect(cell.numberColor).toBe(band.ruleColor)
    expect(Math.abs(cell.numberRuleLeft - cell.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.numberRuleRight - cell.right)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(cell.numberRuleTop - band.boxes[0]!.numberRuleTop),
    ).toBeLessThanOrEqual(1)
    expect(cell.borderTop).toBe(1)
    expect(cell.borderBottom).toBe(1)
    expect(cell.color).toBe(band.ruleColor)
    expect(Math.abs(cell.top - band.boxes[0]!.top)).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.bottom - band.boxes[0]!.bottom)).toBeLessThanOrEqual(1)
    if (index)
      expect(
        Math.abs(cell.left - band.boxes[index - 1]!.right),
      ).toBeLessThanOrEqual(1)
    if (cell.labelTop !== undefined) {
      expect(cell.labelTop).toBeGreaterThanOrEqual(
        cell.top + cell.borderTop * band.scale - 0.1,
      )
      expect(cell.labelBottom!).toBeLessThanOrEqual(
        cell.bottom - cell.borderBottom * band.scale + 0.1,
      )
      expect(cell.centerOffsetX).toBeLessThanOrEqual(1)
      expect(cell.centerOffsetY).toBeLessThanOrEqual(1)
      expect(cell.nameBottom!).toBeLessThanOrEqual(cell.top + 0.01)
      expect(cell.amountTop!).toBeGreaterThanOrEqual(cell.bottom - 0.01)
      expect(cell.numeric).toBeDefined()
      expect(cell.numeric!.text).toMatch(/^\d+\.\d{2}$/)
      expect(cell.numeric!.mode).toBe('horizontal-tb')
      expect(cell.numeric!.size).toBeGreaterThan(0)
      expect(cell.numeric!.size).toBeLessThanOrEqual(16)
      expect(cell.numeric!.clipped).toBe(false)
      expect(cell.numeric!.centerOffset).toBeLessThanOrEqual(1)
      expect(cell.numeric!.left).toBeGreaterThanOrEqual(
        cell.numeric!.viewportLeft,
      )
      expect(cell.numeric!.right).toBeLessThanOrEqual(
        cell.numeric!.viewportRight,
      )
      expect(cell.numeric!.top).toBeGreaterThanOrEqual(
        cell.numeric!.amountBottom - 0.01,
      )
      expect(cell.numeric!.amountBottom).toBeLessThanOrEqual(
        cell.numberRuleTop + 0.1,
      )
      expect(cell.numeric!.top).toBeGreaterThanOrEqual(
        cell.numberRuleTop + band.scale - 0.1,
      )
      expect(
        Math.abs(cell.numeric!.bottom - cell.numeric!.columnBottom),
      ).toBeLessThanOrEqual(1)
    } else {
      expect(cell.numeric).toBeUndefined()
    }
  }
}

/** Success feedback must come from the global top-center Ant message surface. */
async function expectSuccessToast(
  page: import('@playwright/test').Page,
  text: string,
) {
  const toast = page
    .locator('.ant-message-notice-content')
    .filter({ hasText: text })
    .last()
  await expect(toast).toBeVisible()
  // Ant's enter animation moves a visible notice from above the surface; assert its settled geometry.
  await expect(async () => {
    const geometry = await toast.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const surface = element.closest('.ant-message')!.getBoundingClientRect()
      return {
        center: (box.left + box.right) / 2,
        top: box.top,
        surfaceTop: surface.top,
        width: innerWidth,
      }
    })
    expect(Math.abs(geometry.center - geometry.width / 2)).toBeLessThanOrEqual(
      2,
    )
    expect(geometry.top).toBeGreaterThanOrEqual(24)
    expect(Math.abs(geometry.surfaceTop - 24)).toBeLessThanOrEqual(1)
  }).toPass({ timeout: 2000 })
}

/** A hidden overflow rule alone cannot pass: each text rectangle and scroll extent must fit its padded cell. */
async function expectAllGiftTextFits(page: import('@playwright/test').Page) {
  await expect(async () => {
    const metrics = await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      return Array.from(
        document.querySelectorAll<HTMLElement>('.gift-book [data-fit]'),
      ).flatMap((box) => {
        const text = box.querySelector<HTMLElement>('[data-fit-content]')
        if (!text) return []
        const outer = box.getBoundingClientRect(),
          inner = text.getBoundingClientRect(),
          style = getComputedStyle(box)
        box.scrollTop = box.scrollHeight
        box.scrollLeft = box.scrollWidth
        const result = {
          field: box.className,
          text: text.textContent,
          left: inner.left - outer.left - parseFloat(style.paddingLeft),
          right:
            outer.left +
            box.clientWidth -
            parseFloat(style.paddingRight) -
            inner.right,
          top: inner.top - outer.top - parseFloat(style.paddingTop),
          bottom:
            outer.top +
            box.clientHeight -
            parseFloat(style.paddingBottom) -
            inner.bottom,
          overflowX: box.scrollWidth - box.clientWidth,
          overflowY: box.scrollHeight - box.clientHeight,
          textOverflowX:
            text.scrollWidth -
            (box.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight)),
          textOverflowY:
            text.scrollHeight -
            (box.clientHeight -
              parseFloat(style.paddingTop) -
              parseFloat(style.paddingBottom)),
          scrollX: box.scrollLeft,
          scrollY: box.scrollTop,
          centeredX: Math.abs(
            (inner.left + inner.right - outer.left * 2 - box.clientWidth) / 2,
          ),
          centeredY: Math.abs(
            (inner.top + inner.bottom - outer.top * 2 - box.clientHeight) / 2,
          ),
        }
        box.scrollTop = box.scrollLeft = 0
        return [result]
      })
    })
    expect(metrics.length).toBeGreaterThan(0)
    for (const field of metrics) {
      expect(field.left, `${field.field}: left`).toBeGreaterThanOrEqual(-1)
      expect(field.right, `${field.field}: right`).toBeGreaterThanOrEqual(-1)
      expect(field.top, `${field.field}: top`).toBeGreaterThanOrEqual(-1)
      expect(field.bottom, `${field.field}: bottom`).toBeGreaterThanOrEqual(-1)
      expect(field.overflowX, `${field.field}: overflowX`).toBeLessThanOrEqual(
        1,
      )
      expect(field.overflowY, `${field.field}: overflowY`).toBeLessThanOrEqual(
        1,
      )
      expect(
        field.textOverflowX,
        `${field.field}: full text width`,
      ).toBeLessThanOrEqual(1)
      expect(
        field.textOverflowY,
        `${field.field}: full text height`,
      ).toBeLessThanOrEqual(1)
      expect(field.scrollX).toBe(0)
      expect(field.scrollY).toBe(0)
      if (['gift-book-name', 'gift-book-amount'].includes(field.field)) {
        expect(field.centeredX).toBeLessThanOrEqual(1)
        expect(field.centeredY).toBeLessThanOrEqual(1)
      }
    }
  }).toPass({ timeout: 7000 })
}

/** Every name and Chinese amount must fit as a complete, centered, single vertical column. */
async function expectGiftWriting(page: import('@playwright/test').Page) {
  await expectAllGiftTextFits(page)
  const metrics = await page
    .locator('.gift-book-writing')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const columns = Array.from(range.getClientRects()).map(
          (rect) => (rect.left + rect.right) / 2,
        )
        const style = getComputedStyle(element)
        return {
          mode: style.writingMode,
          whitespace: style.whiteSpace,
          size: parseFloat(style.fontSize),
          name: element.parentElement!.classList.contains('gift-book-name'),
          characters: element.textContent?.trim().length || 0,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          maximum: parseFloat(
            getComputedStyle(element.parentElement!).fontSize,
          ),
          columns,
        }
      }),
    )
  expect(metrics.length).toBeGreaterThan(0)
  for (const field of metrics) {
    expect(field.mode).toBe('vertical-rl')
    expect(field.whitespace).toBe('nowrap')
    expect(field.columns.length).toBeGreaterThan(0)
    expect(
      Math.max(...field.columns) - Math.min(...field.columns),
    ).toBeLessThanOrEqual(1)
    expect(field.size).toBeGreaterThan(0)
    expect(field.size).toBeLessThanOrEqual(field.maximum)
    if (
      field.name &&
      field.characters <= 4 &&
      field.viewportWidth >= 390 &&
      field.viewportHeight >= 700
    ) {
      expect(field.size).toBeGreaterThanOrEqual(28)
    }
  }
  const labels = await page
    .locator('.gift-book-label')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).writingMode),
    )
  expect(labels.every((mode) => mode === 'vertical-rl')).toBe(true)
}

test('manual WeChat, exact totals, independent attendance, scoped duplicate warnings, correction and void audit', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  await page.goto('/gift-registry')
  await expect(
    page.getByRole('heading', { name: '电子礼簿', exact: true }),
  ).toBeVisible()
  await register(page, '张三', '1.23', '5')
  await expectSuccessToast(page, '礼金已登记')
  await expect(page.getByTestId('entry-name')).toHaveValue('')
  await page.getByRole('radio', { name: '微信', exact: true }).check()
  await register(page, '李四', '2.00', '3')
  await expect.poll(() => state.entries.length).toBe(2)
  await expect(
    page.locator('.ant-statistic').filter({ hasText: '有效礼金总额' }),
  ).toContainText('3.23')
  await expect(
    page.locator('.ant-statistic').filter({ hasText: '已登记到场人数' }),
  ).toContainText('8')
  expect(state.entries[1]).toMatchObject({
    paymentMethod: 'WECHAT',
    amountCents: 200,
    attendeeCount: 3,
  })
  await register(page, ' 张三 ', '5.00', '0')
  await expect(
    page.getByRole('button', { name: '确认后继续保存' }),
  ).toBeVisible()
  expect(state.entries).toHaveLength(2)
  await page.getByRole('button', { name: '确认后继续保存' }).click()
  await expect.poll(() => state.entries.length).toBe(3)
  await expect(
    page.locator('.ant-statistic').filter({ hasText: '人数未登记笔数' }),
  ).toContainText('0')
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '李四', exact: true }) })
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByTestId('entry-amount').fill('4.56')
  await modal.getByLabel('更正 / 作废原因').fill('金额核对')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expectSuccessToast(page, '更正成功')
  await expect(modal).not.toBeVisible()
  await row.getByRole('button', { name: '作废', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByLabel('更正 / 作废原因')
    .fill('重复登记核对作废')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(row).toContainText('已作废')
  await expectSuccessToast(page, '作废成功')
  state.audits.push({
    ...state.audits.at(-1)!,
    id: 'historical-audit',
    actorId: 'removed-user',
    actorName: 'removed-user',
    reason: '历史更正',
  })
  await row.getByRole('button', { name: '操作记录', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('金额核对')
  await expect(page.getByRole('dialog')).toContainText('重复登记核对作废')
  await expect(page.getByRole('dialog')).toContainText('操作者 记账员')
  await expect(page.getByRole('dialog')).toHaveAccessibleName('操作记录 · 李四')
  await expect(page.getByRole('dialog')).toContainText('历史操作员')
  await expect(page.getByRole('dialog').getByTitle('removed-user')).toHaveText(
    '历史操作员',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.locator('.gift-event-picker .ant-select-selector').click()
  await page.getByText('活动B · 2026-10-19', { exact: true }).click()
  await register(page, '张三', '1.00')
  await expect
    .poll(() => state.entries.filter((item) => item.eventId === 'b').length)
    .toBe(1)
  await expect(page.locator('.entry-warning')).toHaveCount(0)
  await expect(
    page.locator('.ant-statistic').filter({ hasText: '人数未登记笔数' }),
  ).toContainText('1')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('gift-workspace.png'),
    fullPage: true,
  })
  expect(
    state.requests.some((request) => /pay|wechat|callback/i.test(request.path)),
  ).toBe(false)
})

test('required event presets preview and render all ten event styles with bundled handwriting', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  await page.goto('/gift-registry')
  // Ten types each render desktop/mobile screenshots and exercise their display link.
  test.setTimeout(480000)
  const presets = [
    { type: 'WEDDING', name: '结婚', label: '贺礼', color: 'rgb(142, 38, 48)' },
    {
      type: 'FUNERAL',
      name: '丧事',
      label: '奠仪',
      color: 'rgb(250, 250, 247)',
    },
    {
      type: 'BIRTHDAY',
      name: '大寿',
      label: '寿礼',
      color: 'rgb(155, 43, 32)',
    },
    {
      type: 'FULL_MOON',
      name: '满月酒',
      label: '贺礼',
      color: 'rgb(248, 216, 210)',
    },
    {
      type: 'HUNDRED_DAYS',
      name: '百天酒',
      label: '贺礼',
      color: 'rgb(247, 227, 190)',
    },
    {
      type: 'FIRST_BIRTHDAY',
      name: '周岁宴',
      label: '贺礼',
      color: 'rgb(185, 71, 45)',
    },
    {
      type: 'ENGAGEMENT',
      name: '订婚宴',
      label: '贺礼',
      color: 'rgb(136, 49, 78)',
    },
    {
      type: 'HOUSEWARMING',
      name: '乔迁宴',
      label: '贺礼',
      color: 'rgb(31, 90, 82)',
    },
    {
      type: 'GRADUATION',
      name: '升学宴',
      label: '贺礼',
      color: 'rgb(36, 63, 103)',
    },
    {
      type: 'BUSINESS_OPENING',
      name: '开业庆典',
      label: '贺礼',
      color: 'rgb(165, 38, 37)',
    },
  ]
  for (const [index, preset] of presets.entries()) {
    await page.setViewportSize({
      width: preset.type === 'FULL_MOON' ? 390 : 1280,
      height: 844,
    })
    await page.getByRole('button', { name: '新建活动', exact: true }).click()
    const modal = page.getByRole('dialog')
    await expect(modal.getByRole('radio')).toHaveCount(10)
    expect(
      await modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`event-types-${preset.type.toLowerCase()}.png`),
      fullPage: false,
    })
    await expect(modal.getByRole('radio', { checked: true })).toHaveCount(0)
    await modal
      .getByLabel('活动名称', { exact: true })
      .fill(`${preset.name}活动`)
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await expect(
      modal.getByText('请选择活动类型与样式', { exact: true }),
    ).toBeVisible()
    await expect(
      modal.getByText('请填写 1 至 1024 字的活动描述', { exact: true }),
    ).toBeVisible()
    await modal.getByRole('radio', { name: new RegExp(preset.name) }).check()
    await modal
      .getByLabel('活动描述', { exact: true })
      .fill(` ${preset.name}亲友相聚，铭记情谊 `)
    const preview = modal.locator('.gift-event-style-preview .gift-book')
    await expect(preview).toHaveAttribute('data-event-type', preset.type)
    await expect(preview.locator('.gift-book-description')).toHaveText(
      `${preset.name}亲友相聚，铭记情谊`,
    )
    await expect(preview.locator('.gift-book-heading h1')).toHaveText(
      `${preset.name}活动`,
    )
    expect(
      await preview.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe(preset.color)
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await expectSuccessToast(page, '活动新建成功')
    await expect.poll(() => state.events.length).toBe(index + 3)
    const event = state.events.at(-1)!
    expect(event.description).toBe(`${preset.name}亲友相聚，铭记情谊`)
    const config = state.settings.get(event.id)!
    Object.assign(config, {
      title: `${preset.name}主题礼簿`,
      photoUrl: photo,
      columnsPerPage: 12,
    })
    state.addEntry(event.id, {
      name: '名字较长的亲朋好友一家人',
      amountCents: 123456,
    })
    state.addEntry(event.id, { name: '张三', amountCents: 100 })
    state.addEntry(event.id, {
      name: '长'.repeat(100),
      amountCents: 99999999999,
    })
    await page.getByRole('button', { name: '展示设置', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '生成展示链接', exact: true })
      .click()
    const link = await page.getByLabel('活动展示链接').inputValue()
    const display = await context.newPage()
    const displayErrors: string[] = []
    display.on('pageerror', (error) => displayErrors.push(error.message))
    display.on('console', (message) => {
      if (message.type() === 'error') displayErrors.push(message.text())
    })
    await display.setViewportSize({ width: 1920, height: 1080 })
    const fontResponse = display.waitForResponse(
      (response) =>
        response.url().includes('MaShanZheng-Regular.ttf') &&
        response.status() === 200,
    )
    await display.goto(link)
    await expect(display.locator('.gift-book')).toHaveAttribute(
      'data-event-type',
      preset.type,
    )
    await expect(display.locator('.gift-book-label')).toHaveText([
      preset.label,
      preset.label,
      preset.label,
    ])
    await expect(display.locator('.gift-book-heading')).toContainText(
      `${preset.name}主题礼簿`,
    )
    await expect(display.locator('.gift-book-event-name')).toHaveCount(0)
    await expect(display.locator('.gift-book-event')).not.toContainText(
      `${preset.name}活动`,
    )
    await fontResponse
    const metrics = await display.evaluate(async () => {
      await document.fonts.load('32px "Gift Handwriting"', '张三壹佰贰拾叁元整')
      const box = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect()
      const book = box('.gift-book'),
        parent = box('.gift-display-book'),
        heading = box('.gift-book-heading'),
        description = box('.gift-book-description'),
        photo = box('.gift-book-photo'),
        date = box('.gift-book-date')
      return {
        fontReady: document.fonts.check(
          '32px "Gift Handwriting"',
          '张三壹佰贰拾叁元整',
        ),
        family: getComputedStyle(document.querySelector('.gift-book-name')!)
          .fontFamily,
        labelSize: parseFloat(
          getComputedStyle(document.querySelector('.gift-book-label')!)
            .fontSize,
        ),
        gap: parent.bottom - book.bottom,
        headingBottom: heading.bottom,
        descriptionTop: description.top,
        descriptionBottom: description.bottom,
        photoTop: photo.top,
        photoBottom: photo.bottom,
        dateTop: date.top,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }
    })
    expect(metrics.fontReady).toBe(true)
    expect(metrics.family).toContain('Gift Handwriting')
    expect(metrics.labelSize).toBeGreaterThanOrEqual(20)
    expect(Math.abs(metrics.gap)).toBeLessThanOrEqual(1)
    expect(metrics.headingBottom).toBeLessThanOrEqual(metrics.descriptionTop)
    expect(metrics.descriptionBottom).toBeLessThanOrEqual(metrics.photoTop)
    expect(metrics.photoBottom).toBeLessThanOrEqual(metrics.dateTop)
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport)
    await expectGiftBand(display)
    await expectGiftWriting(display)
    await expect(display.locator('.gift-book-amount-number')).toHaveText([
      '1234.56',
      '1.00',
      '999999999.99',
    ])
    await expect(display.locator('.gift-book-label-cell:empty')).toHaveCount(9)
    await display.screenshot({
      path: testInfo.outputPath(`fit-${preset.type.toLowerCase()}.png`),
      fullPage: true,
    })
    await display.setViewportSize({ width: 390, height: 844 })
    await expectGiftBand(display)
    await expectGiftWriting(display)
    await expect(display.locator('.gift-book-amount-number')).toHaveText([
      '1234.56',
      '1.00',
    ])
    await display.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(display.locator('.gift-book-name')).toHaveText(
      '长'.repeat(100),
    )
    await expect(display.locator('.gift-book-amount-number')).toHaveText(
      '999999999.99',
    )
    await expectGiftBand(display)
    await expectGiftWriting(display)
    expect(
      await display.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await display.screenshot({
      path: testInfo.outputPath(`fit-${preset.type.toLowerCase()}-390.png`),
      fullPage: true,
    })
    await expect(display.locator('vite-error-overlay')).toHaveCount(0)
    expect(displayErrors).toEqual([])
    await display.close()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close' })
      .click()
  }
})

test('saved links survive reopen and refresh, cache loss issues without revoking, and explicit reset revokes all old links', async ({
  page,
  context,
}) => {
  const state = await fixture(context)
  state.addEntry('a', { name: '可反复打开', amountCents: 10000 })
  const showLink = async () => {
    await page.getByRole('button', { name: '展示设置', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '生成展示链接', exact: true })
      .click()
    return page.getByLabel('活动展示链接').inputValue()
  }
  await page.goto('/gift-registry')
  const first = await showLink()
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  expect(await showLink()).toBe(first)
  await page.reload()
  expect(await showLink()).toBe(first)
  expect(
    state.requests.filter((request) =>
      request.path.endsWith('/display-token/_issue'),
    ),
  ).toHaveLength(1)
  const screen = await context.newPage()
  await screen.goto(first)
  await expect(screen.locator('.gift-book-name')).toHaveText('可反复打开')
  await page.evaluate(() =>
    localStorage.removeItem('gift-registry:display-link:a'),
  )
  await page.reload()
  const second = await showLink()
  expect(second).not.toBe(first)
  await screen.goto(first)
  await expect(screen.locator('.gift-book-name')).toHaveText('可反复打开')
  const other = await context.newPage()
  await other.goto(second)
  await expect(other.locator('.gift-book-name')).toHaveText('可反复打开')
  expect(
    state.requests.filter((request) =>
      request.path.endsWith('/display-token/_rotate'),
    ),
  ).toHaveLength(0)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '重置展示链接', exact: true })
    .click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  const reset = await page.getByLabel('活动展示链接').inputValue()
  expect(reset).not.toBe(second)
  await other.goto(reset)
  await expect(other.locator('.gift-book-name')).toHaveText('可反复打开')
  const revoked = await context.newPage()
  await revoked.goto(first)
  await expect(
    revoked.getByText('Access denied', { exact: true }),
  ).toBeVisible()
  for (const request of state.requests.filter((item) =>
    item.path.startsWith('/gift-registry/events/'),
  )) {
    expect(request.headers['x-gift-display-token']).toBeUndefined()
  }
})

test('photo preview, independent display, new-page synchronization, offline retention, backup and restore', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  state.addEntry('a', { name: '一家亲友', amountCents: 10001 })
  await page.goto('/gift-registry')
  await page.getByRole('button', { name: '展示设置', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('展示标题').fill('喜宴礼簿')
  await modal.getByLabel('每页列数').fill('1')
  await modal.locator('input[type=file]').setInputFiles({
    name: 'event.png',
    mimeType: 'image/png',
    buffer: photoBytes,
  })
  await expect(modal.locator('.gift-photo-preview')).toBeVisible()
  await expectSuccessToast(page, '照片已选取，请保存展示设置')
  expect(
    state.requests.filter((request) =>
      request.path.endsWith('/display-settings/photo'),
    ),
  ).toHaveLength(0)
  await expect(modal.locator('.gift-photo-preview')).toHaveAttribute(
    'src',
    /^blob:/,
  )
  await modal.getByRole('button', { name: '移除照片', exact: true }).click()
  await expectSuccessToast(page, '照片已移除，请保存展示设置')
  await expect(modal.locator('.gift-photo-preview')).toHaveCount(0)
  await modal.locator('input[type=file]').setInputFiles({
    name: 'event-again.png',
    mimeType: 'image/png',
    buffer: photoBytes,
  })
  await expect(modal.locator('.gift-photo-preview')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('r4-display-settings.png'),
    fullPage: true,
  })
  await modal.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.getByRole('dialog').last()).toContainText('喜宴礼簿')
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Close' })
    .click()
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expectSuccessToast(page, '展示设置保存成功')
  const upload = state.requests.filter((request) =>
    request.path.endsWith('/display-settings/photo'),
  )
  expect(upload).toHaveLength(1)
  expect(upload[0]!.method).toBe('POST')
  expect(upload[0]!.headers['content-type']).toMatch(
    /^multipart\/form-data; boundary=/,
  )
  expect(upload[0]!.body).toEqual({
    title: '喜宴礼簿',
    columnsPerPage: 1,
    expectedVersion: 1,
  })
  expect(state.settings.get('a')!.photoUrl).toBe(photo)
  await page.getByRole('button', { name: '展示设置', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '生成展示链接', exact: true })
    .click()
  const link = await page.getByLabel('活动展示链接').inputValue()
  await expectSuccessToast(page, '展示链接已生成')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '复制展示链接', exact: true })
    .click()
  await expectSuccessToast(page, '已复制')
  const display = await context.newPage()
  await display.goto(link)
  await expect(
    display.getByRole('heading', { name: '喜宴礼簿', exact: true }),
  ).toBeVisible()
  await expect(display.locator('.gift-book-name')).toHaveText('一家亲友')
  await expect(display.locator('.gift-book-description')).toHaveCount(0)
  await expect(display.locator('.gift-book-amount')).toHaveText('壹佰元零壹分')
  await expect(display).not.toHaveURL(/token=/)
  await expect(display.locator('.pro-global-header')).toHaveCount(0)
  await expect(
    display.getByRole('img', { name: '活动照片', exact: true }),
  ).toBeVisible()
  state.addEntry('a', { name: '名字较长的亲朋好友一家人', amountCents: 20000 })
  await expect(display.locator('.gift-book-name')).toHaveText(
    '名字较长的亲朋好友一家人',
  )
  await expect(display.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
  state.setOffline(true)
  await expect(
    display.getByText('连接中断，保留最后画面，正在重连').first(),
  ).toBeVisible()
  await expect(display.locator('.gift-book-name')).toHaveText(
    '名字较长的亲朋好友一家人',
  )
  state.addEntry('a', { name: '断线期间登记', amountCents: 30000 })
  state.setOffline(false)
  await expect(display.locator('.gift-book-name')).toHaveText('断线期间登记')
  state.tokens.set('a', 'display-a-v2')
  await display.evaluate(() => {
    window.location.hash = 'token=display-a-v2'
  })
  await expect
    .poll(() =>
      display.evaluate(() => sessionStorage.getItem('gift-registry:display:a')),
    )
    .toBe('display-a-v2')
  await expect(display).not.toHaveURL(/token=/)
  await expect(display.locator('.gift-book-name')).toHaveText('断线期间登记')
  await display.screenshot({
    path: testInfo.outputPath('gift-display.png'),
    fullPage: true,
  })
  const publicCalls = state.requests.filter((request) =>
    request.path.startsWith('/gift-registry/display/'),
  )
  expect(publicCalls.length).toBeGreaterThan(0)
  for (const request of publicCalls) {
    expect(request.headers['x-access-token']).toBeUndefined()
    expect([
      new URLSearchParams(new URL(link).hash.slice(1)).get('token'),
      'display-a-v2',
    ]).toContain(request.headers['x-gift-display-token'])
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载活动备份', exact: true }).click()
  const downloaded = await download
  await expectSuccessToast(page, '已发起备份下载')
  expect(downloaded.suggestedFilename()).toContain(
    'gift-registry-2026-10-19-a.json',
  )
  expect(
    JSON.parse(await readFile((await downloaded.path())!, 'utf8'))
      .schemaVersion,
  ).toBe(2)
  const bundle = {
    schemaVersion: 1,
    event: { ...state.events[0], eventType: undefined, description: undefined },
    settings: {
      ...state.settings.get('a'),
      photoUrl: undefined,
      photoDataUrl: embeddedPhoto,
    },
    entries: state.entries,
    audits: [],
  }
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    })
  await expect.poll(() => state.events.length).toBe(3)
  await expectSuccessToast(page, '已恢复为新活动')
  await expect(
    page.locator('.gift-event-picker .ant-select-selection-item'),
  ).toContainText('活动A（恢复）')
  expect(state.events.at(-1)).toMatchObject({
    eventType: 'WEDDING',
    description: '',
  })
})

test('query permission keeps the workspace read-only and a missing permission denies its static entry', async ({
  page,
  context,
}) => {
  await fixture(context, ['query'])
  await page.goto('/gift-registry')
  await expect(
    page.getByRole('heading', { name: '电子礼簿', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '登记并继续', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '新建活动', exact: true }),
  ).toHaveCount(0)
})

test('missing query permission denies the static workspace route', async ({
  page,
  context,
}) => {
  await fixture(context, [])
  await page.goto('/gift-registry')
  await expect(page).toHaveURL(/\/403$/)
  await expect(
    page.getByRole('button', { name: '登记并继续', exact: true }),
  ).toHaveCount(0)
  await page.goto('/gift-registry/events')
  await expect(page).toHaveURL(/\/403$/)
})

test('display fits complete text and adapts page columns to large and narrow screens', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  const displayErrors: string[] = []
  page.on('pageerror', (error) => displayErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') displayErrors.push(message.text())
  })
  for (let index = 0; index < 12; index++)
    state.addEntry('a', {
      name: index === 11 ? '长'.repeat(100) : `亲朋好友${index + 1}`,
      amountCents: index === 11 ? 99999999999 : 12345,
    })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/gift-registry/display/a#token=display-a')
  await expect(page.locator('.gift-book')).toBeVisible()
  const desktop = await page.evaluate(() => {
    const container = document
      .querySelector('.gift-display-book')!
      .getBoundingClientRect()
    const book = document.querySelector('.gift-book')!.getBoundingClientRect()
    return {
      containerHeight: container.height,
      bookHeight: book.height,
      verticalGap: container.bottom - book.bottom,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      contentWidth:
        document.querySelector<HTMLElement>('.gift-book-pages')!.scrollWidth,
      availableWidth:
        document.querySelector<HTMLElement>('.gift-book-pages')!.clientWidth,
    }
  })
  expect(desktop.bookHeight).toBeGreaterThan(900)
  expect(Math.abs(desktop.verticalGap)).toBeLessThanOrEqual(1)
  expect(desktop.documentWidth).toBeLessThanOrEqual(desktop.viewportWidth)
  expect(desktop.contentWidth).toBeLessThanOrEqual(desktop.availableWidth + 1)
  await expectGiftBand(page)
  await expectGiftWriting(page)
  const verifyColumnCounts = async () => {
    for (const count of [1, 6, 12, 24]) {
      state.settings.get('a')!.columnsPerPage = count
      state.events[0]!.version++
      await expectGiftBand(page, count)
      await expectGiftWriting(page)
      const width = await page
        .locator('.gift-book-pages')
        .evaluate((element) => ({
          content: element.scrollWidth,
          available: element.clientWidth,
          viewport: innerWidth,
        }))
      expect(width.content).toBeLessThanOrEqual(width.available + 1)
    }
    state.settings.get('a')!.columnsPerPage = 12
    state.events[0]!.version++
    await expectGiftBand(page, 12)
  }
  await verifyColumnCounts()
  await page.screenshot({
    path: testInfo.outputPath('fit-display-1920.png'),
    fullPage: true,
  })
  const captureLongTextLayout = () =>
    page.evaluate(async () => {
      await document.fonts.ready
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect()
      const header = document.querySelector<HTMLElement>('.gift-book-heading')!
      const description = document.querySelector<HTMLElement>(
        '.gift-book-description',
      )!
      header.scrollTop = header.scrollHeight
      description.scrollTop = description.scrollHeight
      const book = rect('.gift-book'),
        heading = rect('.gift-book-heading'),
        paragraph = rect('.gift-book-description'),
        frame = rect('.gift-book-photo-frame'),
        image = rect('.gift-book-photo'),
        date = rect('.gift-book-date')
      return {
        bookHeight: book.height,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        titleScroll: header.scrollTop,
        descriptionScroll: description.scrollTop,
        headingBottom: heading.bottom,
        descriptionTop: paragraph.top,
        descriptionBottom: paragraph.bottom,
        photoTop: frame.top,
        photoBottom: frame.bottom,
        photoHeight: frame.height,
        imageHeight: image.height,
        photoCenterOffset: Math.abs(
          (image.top + image.bottom) / 2 - (frame.top + frame.bottom) / 2,
        ),
        dateTop: date.top,
        dateBottom: date.bottom,
        bookBottom: book.bottom,
      }
    })
  const activity = state.events[0]!
  const config = state.settings.get('a')!
  const longDescription = '亲友情谊'.repeat(256)
  activity.description = longDescription
  config.photoUrl = photo
  activity.version++
  await expect(page.locator('.gift-book-description')).toHaveText(
    longDescription,
  )
  await expect(page.locator('.gift-book-photo')).toBeVisible()
  await expectAllGiftTextFits(page)
  const descriptionOnly = await captureLongTextLayout()
  expect(
    Math.abs(descriptionOnly.bookHeight - desktop.bookHeight),
  ).toBeLessThanOrEqual(1)
  expect(descriptionOnly.documentHeight).toBeLessThanOrEqual(
    descriptionOnly.viewportHeight + 1,
  )
  expect(descriptionOnly.descriptionScroll).toBe(0)
  await expectAllGiftTextFits(page)
  expect(descriptionOnly.photoHeight).toBeGreaterThan(100)
  activity.name = '名'.repeat(100)
  config.title = '题'.repeat(128)
  activity.version++
  await expect(page.locator('.gift-book-heading h1')).toHaveText(config.title)
  for (const selector of [
    '.gift-book-heading h1',
    '.gift-book-description span',
  ]) {
    const wrapping = await page.locator(selector).evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return {
        whitespace: getComputedStyle(element).whiteSpace,
        lines: range.getClientRects().length,
      }
    })
    expect(wrapping.whitespace).not.toBe('nowrap')
    expect(wrapping.lines).toBeGreaterThan(1)
  }
  await expect(page.locator('.gift-book-event-name')).toHaveCount(0)
  await expect(page.locator('.gift-book-event')).not.toContainText(
    activity.name,
  )
  await expectAllGiftTextFits(page)
  const maximumText = await captureLongTextLayout()
  expect(
    Math.abs(maximumText.bookHeight - desktop.bookHeight),
  ).toBeLessThanOrEqual(1)
  expect(maximumText.documentHeight).toBeLessThanOrEqual(
    maximumText.viewportHeight + 1,
  )
  expect(maximumText.titleScroll).toBe(0)
  await expectAllGiftTextFits(page)
  expect(maximumText.descriptionScroll).toBe(0)
  expect(maximumText.headingBottom).toBeLessThanOrEqual(
    maximumText.descriptionTop,
  )
  expect(maximumText.descriptionBottom).toBeLessThanOrEqual(
    maximumText.photoTop,
  )
  expect(maximumText.photoHeight).toBeGreaterThan(100)
  expect(maximumText.imageHeight).toBeGreaterThan(0)
  expect(maximumText.photoCenterOffset).toBeLessThanOrEqual(1)
  expect(maximumText.photoBottom).toBeLessThanOrEqual(maximumText.dateTop)
  expect(maximumText.dateBottom).toBeLessThanOrEqual(maximumText.bookBottom)
  await page.screenshot({
    path: testInfo.outputPath('fit-display-max-text-1920.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectGiftBand(page)
  const narrow = await page.evaluate(() => {
    const container = document
      .querySelector('.gift-display-book')!
      .getBoundingClientRect()
    const book = document.querySelector('.gift-book')!.getBoundingClientRect()
    const pages = document.querySelector<HTMLElement>('.gift-book-pages')!
    pages.scrollLeft = 100
    return {
      verticalGap: container.bottom - book.bottom,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      contentWidth: pages.scrollWidth,
      availableWidth: pages.clientWidth,
      scrollLeft: pages.scrollLeft,
    }
  })
  expect(Math.abs(narrow.verticalGap)).toBeLessThanOrEqual(1)
  expect(narrow.documentWidth).toBeLessThanOrEqual(narrow.viewportWidth)
  expect(narrow.contentWidth).toBeLessThanOrEqual(narrow.availableWidth + 1)
  expect(narrow.scrollLeft).toBe(0)
  await expectGiftBand(page)
  await verifyColumnCounts()
  await expectAllGiftTextFits(page)
  const narrowMaximumText = await captureLongTextLayout()
  expect(narrowMaximumText.documentHeight).toBeLessThanOrEqual(
    narrowMaximumText.viewportHeight + 1,
  )
  expect(narrowMaximumText.imageHeight).toBeGreaterThan(0)
  expect(narrowMaximumText.photoBottom).toBeLessThanOrEqual(
    narrowMaximumText.dateTop,
  )
  await page.screenshot({
    path: testInfo.outputPath('fit-display-390.png'),
    fullPage: true,
  })
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await expectGiftBand(page)
    await verifyColumnCounts()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`fit-display-${viewport.width}.png`),
      fullPage: true,
    })
  }
  await expectGiftWriting(page)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(displayErrors).toEqual([])
  await testInfo.attach('display-layout-metrics', {
    body: JSON.stringify(
      { desktop, descriptionOnly, maximumText, narrow, narrowMaximumText },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})

test('display title validation and write feedback distinguish rejected writes from committed saves with failed refresh', async ({
  page,
  context,
}) => {
  const state = await fixture(context)
  let rejectWrite = true
  let failRefresh = false
  let writeCount = 0
  await context.route(
    '**/api/gift-registry/events/a/display-settings',
    async (route) => {
      if (route.request().method() === 'PUT') {
        writeCount++
        if (!rejectWrite) return route.fallback()
      } else if (!failRefresh) return route.fallback()
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          status: 500,
          message: 'Settings request failed',
        }),
      })
    },
  )
  await page.goto('/gift-registry')
  await page.getByRole('button', { name: '展示设置', exact: true }).click()
  const modal = page.getByRole('dialog')
  const title = modal.getByLabel('展示标题')
  await expect(title).toHaveAttribute('maxlength', '128')
  await title.fill('   ')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    modal.getByText('请填写 1 至 128 字的展示标题', { exact: true }),
  ).toBeVisible()
  expect(writeCount).toBe(0)
  await expect(page.locator('.ant-message-success')).toHaveCount(0)
  await title.fill(' 独立展示标题 ')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal).toContainText('Settings request failed')
  expect(writeCount).toBe(1)
  await expect(page.locator('.ant-message-success')).toHaveCount(0)
  rejectWrite = false
  failRefresh = true
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expectSuccessToast(page, '展示设置保存成功')
  await expect(modal).not.toBeVisible()
  expect(state.settings.get('a')!.title).toBe('独立展示标题')
  await expect(page.locator('.gift-workspace')).toContainText(
    'Settings request failed',
  )
  expect(writeCount).toBe(2)
})

test('Excel export downloads a real xlsx for all applied filtered entries and never reports success on failure', async ({
  page,
  context,
}) => {
  const state = await fixture(context, ['query', 'export'])
  for (let index = 1; index <= 25; index++)
    state.addEntry('a', {
      name: `导出宾客${String(index).padStart(2, '0')}`,
      amountCents: 123,
      paymentMethod: 'WECHAT',
    })
  state.addEntry('a', { name: '未匹配宾客', paymentMethod: 'CASH' })
  await page.goto('/gift-registry')
  const nameFilter = page.locator(
    '.gift-ledger-card .pro-query .query-value-container input',
  )
  await nameFilter.fill('导出宾客')
  const filtered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/events/a/entries/_query') &&
      response
        .request()
        .postDataJSON()
        .terms?.some(
          (term: { column: string; value: unknown }) =>
            term.column === 'name' && term.value === '%导出宾客%',
        ) &&
      response.status() === 200,
  )
  await page
    .locator('.gift-ledger-card .pro-query')
    .getByRole('button', { name: '搜索', exact: true })
    .click()
  await filtered
  await expect(
    page.getByRole('cell', { name: '未匹配宾客', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.ant-table-tbody tr.ant-table-row')).toHaveCount(
    20,
  )
  await nameFilter.fill('未提交的筛选草稿')
  const nextDownload = page.waitForEvent('download')
  await page
    .getByRole('button', { name: '导出当前筛选全部明细', exact: true })
    .click()
  const file = await nextDownload
  expect(file.suggestedFilename()).toBe('gift-entries.xlsx')
  const content = await readFile((await file.path())!)
  expect(
    content.equals(
      await readFile(new URL('./fixtures/gift-entries.xlsx', import.meta.url)),
    ),
  ).toBe(true)
  expect(content.subarray(0, 4).toString('hex')).toBe('504b0304')
  expect(content.toString('utf8')).toContain('xl/worksheets/sheet1.xml')
  expect(content.toString('utf8')).toContain('导出宾客25')
  const call = state.requests.find((request) =>
    request.path.endsWith('/entries/_export'),
  )!
  expect(call.body).toEqual({
    paging: false,
    terms: [{ column: 'name', termType: 'like', value: '%导出宾客%' }],
  })
  await expectSuccessToast(page, '已发起礼金明细 Excel 下载')
  await page.locator('.ant-message-success').waitFor({ state: 'hidden' })
  state.setExportRejected(true)
  let unexpectedDownload = false
  page.on('download', () => {
    unexpectedDownload = true
  })
  await page
    .getByRole('button', { name: '导出当前筛选全部明细', exact: true })
    .click()
  await expect(page.locator('.gift-workspace')).toContainText('Access denied')
  await expect(page.locator('.ant-message-success')).toHaveCount(0)
  expect(unexpectedDownload).toBe(false)
})

test('gift entry conditions reuse the shared query editor, history and responsive layout', async ({
  page,
  context,
}) => {
  const state = await fixture(context, ['query'])
  state.addEntry('a', { name: '张三', paymentMethod: 'WECHAT' })
  state.addEntry('a', { name: '张四', paymentMethod: 'CASH' })
  state.addEntry('a', { name: '王五', paymentMethod: 'CASH' })
  state.addEntry('b', { name: '李四', paymentMethod: 'CASH' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/gift-registry')
  await expect(page).toHaveURL(/\/gift-registry$/)
  expect(await page.title()).not.toBe('')
  const query = page.locator('.gift-ledger-card .pro-query')
  await expect(query).toBeVisible()
  await expect(page.locator('.gift-filters')).toHaveCount(0)
  await expect(query.locator('.query-row')).toHaveCount(1)
  await query.locator('.query-value-container input').fill('张')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(2)
  await query.getByRole('button', { name: '更多筛选', exact: true }).click()
  await expect(query.locator('.query-row')).toHaveCount(6)
  const payment = query.locator('[data-query-row="0.1"]')
  const choose = async (
    control: import('@playwright/test').Locator,
    label: string,
  ) => {
    await control.locator('.ant-select-selector').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(label, { exact: true })
      .click()
  }
  await choose(payment.locator('.query-row-relation'), '并且')
  await choose(payment.locator('.query-field'), '支付方式')
  await choose(payment.locator('.query-value-container .ant-select'), '微信')
  const time = query.locator('[data-query-row="0.2"]')
  await choose(time.locator('.query-field'), '录入时间')
  await expect(time.locator('.ant-picker-range')).toBeVisible()
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '张三', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.ant-table-row')).toHaveCount(1)
  expect(
    state.requests
      .filter((request) => request.path.endsWith('/entries/_query'))
      .at(-1)?.body,
  ).toMatchObject({
    terms: [
      { column: 'name', termType: 'like', value: '%张%' },
      { type: 'and', column: 'paymentMethod', termType: 'eq', value: 'WECHAT' },
    ],
  })
  await query.getByRole('button', { name: '保存查询', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('微信礼金')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await query.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(3)
  await query.getByRole('button', { name: '搜索记录', exact: true }).click()
  await page
    .locator('.query-history-menu')
    .getByText('微信礼金', { exact: true })
    .click()
  await expect(page.locator('.ant-table-row')).toHaveCount(1)
  await expect(
    query.locator('[data-query-row="0.0"] input').last(),
  ).toHaveValue('张')
  await query.screenshot({
    path: 'test-results/gift-query-validation/query-desktop.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      query.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1)
  await query.getByRole('button', { name: '收起筛选', exact: true }).click()
  await query.screenshot({
    path: 'test-results/gift-query-validation/query-mobile.png',
  })
  await page.locator('.gift-event-picker .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('活动B · 2026-10-19', { exact: true })
    .click()
  await expect(
    page.getByRole('cell', { name: '李四', exact: true }),
  ).toBeVisible()
  await expect(query.locator('.query-row')).toHaveCount(1)
  await expect(query.locator('.query-value-container input')).toHaveValue('')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('activity management menus and routes follow configured names paths visibility and grants', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context, ['query', 'save'], [])
  const navigation = page.getByRole('navigation', { name: '一级菜单' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/gift-registry')
  await expect(
    page.getByRole('heading', { name: '电子礼簿', exact: true }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('menuitem', { name: '活动管理', exact: true }),
  ).toHaveCount(0)
  await page.goto('/gift-registry/events')
  await expect(page.locator('.ant-result-title')).toHaveText('页面不存在')

  const configured: ServerMenu = {
    id: 'configured-management',
    code: 'gift-registry/Manage',
    name: '宴席活动列表',
    url: '/activities/manage',
    icon: 'CalendarOutlined',
    options: { show: true },
    granted: true,
  }
  state.menus.push(configured)
  await page.goto('/gift-registry')
  await navigation
    .getByRole('menuitem', { name: configured.name, exact: true })
    .click()
  await expect(page).toHaveURL(/\/activities\/manage$/)
  await expect(
    page.getByRole('heading', { name: '活动管理', exact: true }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('menuitem', { name: '活动管理', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('configured-activity-menu.png'),
    fullPage: true,
  })

  for (const blocked of [
    { show: false, granted: true },
    { show: true, granted: false },
  ]) {
    configured.options = { show: blocked.show }
    configured.granted = blocked.granted
    await page.goto('/gift-registry')
    await expect(
      page.getByRole('heading', { name: '电子礼簿', exact: true }),
    ).toBeVisible()
    await expect(
      navigation.getByRole('menuitem', { name: configured.name, exact: true }),
    ).toHaveCount(0)
    await page.goto(configured.url!)
    await expect(page.locator('.ant-result-title')).toHaveText('页面不存在')
  }
  state.menus.splice(0)
  await page.goto('/gift-registry')
  await expect(
    page.getByRole('heading', { name: '电子礼簿', exact: true }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('menuitem', { name: configured.name, exact: true }),
  ).toHaveCount(0)
  await page.goto('/gift-registry/events')
  await expect(page.locator('.ant-result-title')).toHaveText('页面不存在')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('activity management creates in place through the shared form and preserves filters', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  await page.goto('/gift-registry/events?keep=1')
  const create = page.getByRole('button', { name: '新建活动', exact: true })
  await expect(create).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('list-create-desktop.png'),
  })
  await create.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('radio')).toHaveCount(10)
  await expect(page).toHaveURL(/\/gift-registry\/events\?keep=1$/)
  await expect(
    page
      .getByRole('navigation', { name: '一级菜单' })
      .getByRole('menuitem', { name: '活动管理', exact: true }),
  ).toHaveClass(/ant-menu-item-selected/)
  await modal.getByLabel('活动名称', { exact: true }).fill('取消的活动')
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(state.events).toHaveLength(2)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '活动管理', exact: true }),
  ).toBeVisible()
  await expect(modal).toHaveCount(0)

  const query = page.locator('.gift-management-table .pro-query')
  await query.locator('.query-value-container input').fill('列表')
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(0)
  await create.click()
  await expect(modal.getByLabel('活动名称', { exact: true })).toHaveValue('')
  await modal.getByLabel('活动名称', { exact: true }).fill('列表新建满月酒')
  await modal.getByRole('radio', { name: /满月酒/ }).check()
  await modal.getByLabel('活动描述', { exact: true }).fill('亲友相聚，喜迎新生')
  await expect(
    modal.locator('.gift-event-style-preview .gift-book'),
  ).toHaveAttribute('data-event-type', 'FULL_MOON')
  await modal.getByRole('button', { name: '放大预览', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '预览', exact: true })
  await expect(preview.locator('.gift-book')).toHaveAttribute('data-event-type', 'FULL_MOON')
  await preview.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(preview).not.toBeVisible()
  const date = modal.getByLabel('活动日期', { exact: true })
  expect(await date.getAttribute('type')).not.toBe('date')
  const next = new Date(`${await date.inputValue()}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const selectedDate = next.toISOString().slice(0, 10)
  await date.click()
  await page
    .locator('.ant-picker-dropdown:visible')
    .locator(`td[title="${selectedDate}"]`)
    .click()
  await expect(date).toHaveValue(selectedDate)
  await date.hover()
  await modal.locator('.ant-picker-clear').click()
  await expect(date).toHaveValue('')
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal.locator('.ant-form-item-explain-error')).toBeVisible()
  expect(state.events).toHaveLength(2)
  await date.click()
  await page
    .locator('.ant-picker-dropdown:visible')
    .locator(`td[title="${selectedDate}"]`)
    .click()
  await expect(date).toHaveValue(selectedDate)
  await expect(page.locator('.ant-picker-dropdown:visible')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('list-create-form-desktop.png'),
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expectSuccessToast(page, '活动新建成功')
  await expect.poll(() => state.events.length).toBe(3)
  expect(state.events.at(-1)).toMatchObject({
    name: '列表新建满月酒',
    eventType: 'FULL_MOON',
    description: '亲友相聚，喜迎新生',
    eventDate: selectedDate,
  })
  await expect(page).toHaveURL(/\/gift-registry\/events\?keep=1$/)
  await expect(query.locator('.query-value-container input')).toHaveValue('列表')
  await expect(page.locator('.ant-table-row')).toHaveCount(1)
  await expect(
    page
      .getByRole('navigation', { name: '一级菜单' })
      .getByRole('menuitem', { name: '活动管理', exact: true }),
  ).toHaveClass(/ant-menu-item-selected/)
  const queries = state.requests.filter(
    (request) => request.path === '/gift-registry/events/_query',
  )
  expect(queries.at(-1)?.body).toMatchObject({
    terms: [{ column: 'name', value: '%列表%' }],
  })
  const row = page.getByRole('row').filter({
    has: page.getByRole('cell', { name: '列表新建满月酒', exact: true }),
  })
  await row.getByRole('button', { name: '活动设置', exact: true }).click()
  await expect(modal.getByLabel('活动名称', { exact: true })).toHaveValue(
    '列表新建满月酒',
  )
  await expect(modal.getByLabel('活动日期', { exact: true })).toHaveValue(
    selectedDate,
  )
  await modal.getByRole('button', { name: '取消', exact: true }).click()

  await page.getByRole('button', { name: '新建活动', exact: true }).click()
  await expect(modal.getByRole('radio')).toHaveCount(10)
  await expect(modal.getByLabel('活动名称', { exact: true })).toHaveValue('')
  await modal.getByRole('button', { name: '取消', exact: true }).click()
})

for (const width of [1280, 390]) {
  test(`activity management edits in place and preserves filters and page (${width}px)`, async ({
    page,
    context,
  }, testInfo) => {
    const state = await fixture(context)
    for (let index = 0; index < 24; index++) {
      const event = {
        ...state.events[0]!,
        id: `extra-${index}`,
        name: `活动${index}`,
        description: `活动资料${index}`,
        version: index + 10,
      }
      state.events.push(event)
      state.settings.set(event.id, { ...state.settings.get('a')!, title: event.name })
    }
    const original = { ...state.events[20]! }
    state.settings.set(original.id, {
      ...state.settings.get(original.id)!,
      title: '独立展示标题',
      photoUrl: photo,
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/gift-registry/events?keep=edit')
    const query = page.locator('.gift-management-table .pro-query')
    await query.locator('.query-value-container input').fill('活动')
    await query.getByRole('button', { name: '搜索', exact: true }).click()
    await page.locator('.ant-pagination-item-2').click()
    const row = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: original.name, exact: true }),
    })
    await row.getByRole('button', { name: '活动设置', exact: true }).click()
    const modal = page.getByRole('dialog')
    await expect(page).toHaveURL(/\/gift-registry\/events\?keep=edit$/)
    await expect(modal.getByLabel('活动名称', { exact: true })).toHaveValue(original.name)
    await expect(modal.locator('textarea')).toHaveValue(original.description)
    await expect(modal.getByLabel('活动日期', { exact: true })).toHaveValue(original.eventDate)
    await expect(modal.getByRole('radio', { name: /结婚/ })).toBeChecked()
    await expect(modal.locator('.gift-event-style-preview h1')).toHaveText('独立展示标题')
    await expect(modal.locator('.gift-event-style-preview .gift-book-photo')).toHaveAttribute('src', photo)
    await modal.getByLabel('活动名称', { exact: true }).fill('取消的修改')
    await modal.getByRole('button', { name: '取消', exact: true }).click()
    await expect(modal).not.toBeVisible()
    expect(state.events[20]).toEqual(original)
    expect(state.requests.filter((request) => request.method === 'PUT')).toHaveLength(0)
    await expect(row).toContainText(original.name)

    await row.getByRole('button', { name: '活动设置', exact: true }).click()
    await expect(modal.getByLabel('活动名称', { exact: true })).toHaveValue(original.name)
    await modal.getByLabel('活动名称', { exact: true }).fill(`${original.name}已修改`)
    await modal.locator('textarea').fill('原地编辑保存的描述')
    await modal.getByRole('radio', { name: /满月酒/ }).check()
    await modal.getByLabel('活动日期', { exact: true }).click()
    await page.locator('.ant-picker-dropdown:visible td[title="2026-10-20"]').click()
    await page.screenshot({ path: testInfo.outputPath(`list-edit-${width}.png`) })
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await expectSuccessToast(page, '活动更新成功')
    const write = state.requests.find((request) => request.method === 'PUT')
    expect(write).toMatchObject({
      path: `/gift-registry/events/${original.id}`,
      body: {
        name: `${original.name}已修改`,
        description: '原地编辑保存的描述',
        eventDate: '2026-10-20',
        eventType: 'FULL_MOON',
        status: original.status,
        expectedVersion: original.version,
      },
    })
    await expect(page).toHaveURL(/\/gift-registry\/events\?keep=edit$/)
    await expect(query.locator('.query-value-container input')).toHaveValue('活动')
    await expect(page.locator('.ant-pagination-item-2')).toHaveClass(/ant-pagination-item-active/)
    await expect(
      page.getByRole('navigation', { name: '一级菜单' })
        .getByRole('menuitem', { name: '活动管理', exact: true }),
    ).toHaveClass(/ant-menu-item-selected/)
    expect(state.requests.filter((request) => request.path === '/gift-registry/events/_query').at(-1)?.body)
      .toMatchObject({ pageIndex: 1, pageSize: 20, terms: [{ column: 'name', value: '%活动%' }] })
    const updated = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: `${original.name}已修改`, exact: true }),
    })
    await updated.getByRole('button', { name: '活动设置', exact: true }).click()
    await expect(modal.getByLabel('活动日期', { exact: true })).toHaveValue('2026-10-20')
    await expect(modal.getByRole('radio', { name: /满月酒/ })).toBeChecked()
    await modal.locator('textarea').fill('第二次修改')
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await expect(modal).not.toBeVisible()
    expect(state.requests.filter((request) => request.method === 'PUT').at(-1)?.body)
      .toMatchObject({ expectedVersion: original.version + 1, description: '第二次修改' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    expect(errors).toEqual([])
    await updated.getByRole('button', { name: '打开礼簿', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/gift-registry\\?eventId=${original.id}$`))
  })
}

test('activity management creates the first activity on a narrow screen', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  state.events.splice(0)
  state.settings.clear()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gift-registry/events')
  const create = page.getByRole('button', { name: '新建活动', exact: true })
  await expect(create).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('list-create-mobile.png'),
  })
  await create.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('radio')).toHaveCount(10)
  await modal.getByLabel('活动名称', { exact: true }).fill('首场百天酒')
  await modal.getByRole('radio', { name: /百天酒/ }).check()
  await modal.getByLabel('活动描述', { exact: true }).fill('百日安康')
  const date = modal.getByLabel('活动日期', { exact: true })
  const next = new Date(`${await date.inputValue()}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const selectedDate = next.toISOString().slice(0, 10)
  await date.click()
  await page
    .locator('.ant-picker-dropdown:visible')
    .locator(`td[title="${selectedDate}"]`)
    .click()
  await expect(date).toHaveValue(selectedDate)
  await expect(
    modal.locator('.gift-event-style-preview .gift-book'),
  ).toHaveAttribute('data-event-type', 'HUNDRED_DAYS')
  await expect(page.locator('.ant-picker-dropdown:visible')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('list-create-form-mobile.png'),
  })
  await modal.getByRole('button', { name: '保存', exact: true }).click()
  await expect(modal).not.toBeVisible()
  await expectSuccessToast(page, '活动新建成功')
  await expect.poll(() => state.events.length).toBe(1)
  expect(state.events[0]).toMatchObject({
    eventType: 'HUNDRED_DAYS',
    eventDate: selectedDate,
  })
  await expect(page).toHaveURL(/\/gift-registry\/events$/)
  await expect(
    page.getByRole('heading', { name: '活动管理', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('cell', { name: '首场百天酒', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('activity management separates close reopen and confirmed deletion while keeping the book creation entry', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context, ['query', 'save', 'delete'])
  state.events[0]!.description = '亲友相聚'
  state.events[1]!.status = 'CLOSED'
  state.addEntry('a', { name: '删除范围测试' })
  await page.goto('/gift-registry')
  await expect(
    page.getByRole('button', { name: '新建活动', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem(
      'gift-registry:display-link:a',
      `${location.origin}/gift-registry/display/a#token=display-a`,
    )
    sessionStorage.setItem('gift-registry:display:a', 'display-a')
  })
  await page.goto('/gift-registry/events')
  await expect(
    page.getByRole('heading', { name: '活动管理', exact: true }),
  ).toBeVisible()
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '活动A', exact: true }) })
  const legacy = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '活动B', exact: true }) })
  await expect(
    row.getByRole('button', { name: '删除', exact: true }),
  ).toHaveCount(0)
  await expect(legacy).toContainText('请先在活动设置中补全活动描述')
  await legacy.getByRole('button', { name: '活动设置', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByLabel('活动名称', { exact: true }),
  ).toHaveValue('活动B')
  await page
    .getByRole('dialog')
    .getByLabel('活动描述', { exact: true })
    .fill('补齐历史活动资料')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page).toHaveURL(/\/gift-registry\/events$/)
  for (const action of ['结束活动', '重新开启', '结束活动']) {
    const version = state.events[0]!.version
    await row.getByRole('button', { name: action, exact: true }).click()
    const confirmation = page.locator('.ant-popconfirm').filter({
      hasText:
        action === '结束活动'
          ? '确认结束此活动？结束后将停止礼金录入和更正。'
          : '确认重新开启此活动？',
    })
    await confirmation.locator('.ant-btn-primary').click()
    await expect.poll(() => state.events[0]!.version).toBe(version + 1)
    await expect(row).toContainText(action === '结束活动' ? '已结束' : '进行中')
    await expect(confirmation).not.toBeVisible()
  }
  await row.getByRole('button', { name: '删除', exact: true }).click()
  const deletion = page
    .locator('.ant-popconfirm')
    .filter({ hasText: '确认永久删除“活动A”' })
  await expect(deletion).toContainText('全部礼金、展示设置和操作记录')
  // Leave the icon's hover tooltip before using the overlapping confirmation actions.
  await deletion.locator('.ant-popconfirm-message-title').hover()
  await expect(
    page.getByRole('tooltip', { name: '删除', exact: true }),
  ).not.toBeVisible()
  await deletion.getByRole('button', { name: '取消', exact: true }).click()
  await expect(deletion).not.toBeVisible()
  expect(
    state.requests.filter((request) => request.method === 'DELETE'),
  ).toHaveLength(0)
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await deletion.locator('.ant-popconfirm-message-title').hover()
  await expect(
    page.getByRole('tooltip', { name: '删除', exact: true }),
  ).not.toBeVisible()
  await deletion.getByRole('button', { name: '删除', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expectSuccessToast(page, '活动及全部相关数据已删除')
  expect(state.entries.filter((entry) => entry.eventId === 'a')).toHaveLength(0)
  expect(state.settings.has('a')).toBe(false)
  expect(
    await page.evaluate(() =>
      localStorage.getItem('gift-registry:display-link:a'),
    ),
  ).toBeNull()
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('gift-registry:display:a'),
    ),
  ).toBeNull()
  await page.screenshot({
    path: testInfo.outputPath('r5-event-management.png'),
    fullPage: true,
  })
  await page.goto('/gift-registry?eventId=a')
  await expect(
    page.locator('.gift-event-picker .ant-select-selection-item'),
  ).toContainText('活动B')
  await expect(
    page.getByRole('button', { name: '新建活动', exact: true }),
  ).toBeVisible()
})

test('activity management query-only access exposes no state or delete controls', async ({
  page,
  context,
}) => {
  const state = await fixture(context, ['query'])
  state.events[0]!.description = '可读活动'
  state.events[1]!.status = 'CLOSED'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/gift-registry/events')
  await expect(
    page.getByRole('heading', { name: '活动管理', exact: true }),
  ).toBeVisible()
  for (const name of ['新建活动', '结束活动', '重新开启', '删除', '活动设置'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '打开礼簿', exact: true }),
  ).toHaveCount(2)
  const query = page.locator('.gift-management-table .pro-query')
  await expect(query).toBeVisible()
  await query.locator('.query-value-container input').fill('活动A')
  const filtered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/events/_query') &&
      response
        .request()
        .postDataJSON()
        .terms?.some(
          (term: { column: string; value: unknown }) =>
            term.column === 'name' && term.value === '%活动A%',
        ) &&
      response.status() === 200,
  )
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  await filtered
  await expect(
    page.getByRole('button', { name: '打开礼簿', exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('cell', { name: '活动B', exact: true }),
  ).toHaveCount(0)
  await query.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(2)
  await query.locator('.query-field .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('活动状态', { exact: true })
    .click()
  await query.locator('.query-value-container .ant-select-selector').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('已结束', { exact: true })
    .click()
  await query.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(1)
  await expect(
    page.getByRole('cell', { name: '活动B', exact: true }),
  ).toBeVisible()
  await query.getByRole('button', { name: '保存查询', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名称', { exact: true }).fill('已结束活动')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await query.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.ant-table-row')).toHaveCount(2)
  await query.getByRole('button', { name: '搜索记录', exact: true }).click()
  await page
    .locator('.query-history-menu')
    .getByText('已结束活动', { exact: true })
    .click()
  await expect(page.locator('.ant-table-row')).toHaveCount(1)
  await expect(query.locator('.query-row')).toHaveCount(6)
  await query.screenshot({
    path: 'test-results/gift-events-query-validation/query-desktop.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      query.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1)
  await query.getByRole('button', { name: '收起筛选', exact: true }).click()
  await query.screenshot({
    path: 'test-results/gift-events-query-validation/query-mobile.png',
  })
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(
    state.requests.some(
      (request) => request.method === 'PUT' || request.method === 'DELETE',
    ),
  ).toBe(false)
  await page.goto('/gift-registry?create=1')
  await expect(
    page.getByRole('heading', { name: '电子礼簿', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '新建活动', exact: true }),
  ).toHaveCount(0)
  expect(
    state.requests.some(
      (request) =>
        request.method === 'POST' && request.path === '/gift-registry/events',
    ),
  ).toBe(false)
})

test('a full credential pool without a cached link still exposes explicit reset', async ({
  page,
  context,
}) => {
  const state = await fixture(context)
  state.issuedTokens.set(
    'a',
    new Set(Array.from({ length: 100 }, (_, index) => `old-${index}`)),
  )
  await page.goto('/gift-registry')
  await page.getByRole('button', { name: '展示设置', exact: true }).click()
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith('/display-token/_issue') &&
      response.status() === 409,
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '生成展示链接', exact: true })
    .click()
  await rejected
  await expect(page.getByLabel('活动展示链接')).toHaveCount(0)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '重置展示链接', exact: true })
    .click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(page.getByLabel('活动展示链接')).toHaveValue(
    /#token=display-a-rotated-/,
  )
  expect(state.issuedTokens.get('a')?.size).toBe(0)
})

test('responsive display pages every record, polls HTTP versions without WebSockets, and clears revoked access', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  const names = ['首位宾客', '中间宾客', '末位宾客']
  state.settings.get('a')!.columnsPerPage = 24
  for (const name of names)
    state.addEntry('a', { name, amountCents: 99999999999 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gift-registry/display/a#token=display-a')
  await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
  await expect(page.locator('.gift-book-name')).toHaveText(['末位宾客'])
  await expectGiftBand(page, 24)
  await expectGiftWriting(page)
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await expect(page.locator('.gift-book-name')).toHaveText(names.slice(0, 2))
  await expectGiftWriting(page)
  const calls = state.requests.filter((request) =>
    request.path.endsWith('/snapshot'),
  ).length
  await expect
    .poll(
      () =>
        state.requests.filter((request) => request.path.endsWith('/version'))
          .length,
    )
    .toBeGreaterThan(0)
  expect(
    state.requests.filter((request) => request.path.endsWith('/snapshot')),
  ).toHaveLength(calls)
  expect(state.webSocketAttempts).toEqual([])
  // A committed correction advances the version but preserves the manually selected page.
  state.entries[0]!.name = '更正首位宾客'
  state.events[0]!.version++
  await expect(page.locator('.gift-book-name')).toHaveText([
    '更正首位宾客',
    '中间宾客',
  ])
  // A committed registration is discovered by the next periodic HTTP probe and follows the tail.
  state.addEntry('a', { name: '实时新宾客', amountCents: 123456 })
  await expect(page.getByText('第 2 / 2 页', { exact: true })).toBeVisible()
  await expect(page.locator('.gift-book-name')).toHaveText([
    '末位宾客',
    '实时新宾客',
  ])
  await expectGiftWriting(page)
  await expect(page.locator('.gift-book-amount-number')).toHaveText([
    '999999999.99',
    '1234.56',
  ])
  await page.screenshot({
    path: testInfo.outputPath('r10-responsive-polling-390.png'),
    fullPage: true,
  })
  state.tokens.set('a', 'revoked')
  await expect(page.locator('.gift-book')).toHaveCount(0)
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
  const stoppedAt = state.requests.filter((request) =>
    request.path.startsWith('/gift-registry/display/'),
  ).length
  await page.waitForTimeout(2200)
  expect(
    state.requests.filter((request) =>
      request.path.startsWith('/gift-registry/display/'),
    ),
  ).toHaveLength(stoppedAt)
  expect(state.webSocketAttempts).toEqual([])
})

test('gift management inherits system styles and keeps statistics and portal dialogs readable', async ({
  page,
  context,
}, testInfo) => {
  const state = await fixture(context)
  state.events[0]!.description = '亲友相聚，共记情谊'
  state.addEntry('a', {
    name: '视觉验收宾客',
    amountCents: 98_935_557_400,
    attendeeCount: 45,
  })
  state.addEntry('a', {
    name: '微信宾客',
    amountCents: 1_055_554,
    paymentMethod: 'WECHAT',
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const captureDialog = async (name: string, width: number) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const surface = dialog.locator('.ant-modal')
    await expect(surface).toBeVisible()
    const geometry = await surface.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        viewport: innerWidth,
        title: getComputedStyle(element.querySelector('.ant-modal-title')!)
          .fontSize,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(15)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport - 15)
    expect(geometry.title).toBe('16px')
    const formRows = await surface
      .locator('.ant-form-item-row')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const rect = row.getBoundingClientRect()
          const parent = row.parentElement!.getBoundingClientRect()
          const label = row.querySelector<HTMLElement>(
            '.ant-form-item-label label',
          )
          const content = row.querySelector(
            '.ant-form-item-control-input-content',
          )
          const widget = content?.querySelector(
            ':scope > .ant-input, :scope > .ant-input-affix-wrapper, :scope > .ant-input-number, :scope > .ant-select, :scope > .ant-input-textarea',
          )
          return {
            width: rect.width,
            parentWidth: parent.width,
            label: label?.textContent?.trim(),
            labelHeight: label?.getBoundingClientRect().height || 0,
            controlWidth: content?.getBoundingClientRect().width || 0,
            widgetWidth: widget?.getBoundingClientRect().width,
          }
        }),
      )
    for (const row of formRows) {
      expect(row.width).toBeGreaterThanOrEqual(row.parentWidth - 1)
      if (row.widgetWidth !== undefined)
        expect(row.widgetWidth).toBeGreaterThanOrEqual(row.controlWidth - 1)
      if (row.label && row.label.length === 4)
        expect(row.labelHeight).toBeLessThanOrEqual(32)
    }
    await page.screenshot({
      path: testInfo.outputPath(`r9-${name}-${width}.png`),
      fullPage: true,
    })
  }
  for (const width of [1920, 1024, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/gift-registry')
    await expect(page.locator('.gift-statistic-card')).toHaveCount(6, {
      timeout: 30000,
    })
    await expect(page.locator('.gift-statistic-card--total')).toContainText(
      '989,366,129.54',
    )
    for (const statistic of await page.locator('.gift-statistic-card').all()) {
      expect(
        await statistic
          .locator('.ant-statistic-content')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath(`system-statistics-${width}.png`),
      fullPage: true,
    })
  }
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/gift-registry')
    await expect(page.locator('.gift-entry-card')).toBeVisible()
    await expect(page.locator('.gift-statistic-card')).toHaveCount(6, {
      timeout: 30000,
    })
    await expect(page.locator('.gift-statistic-card--total')).toContainText(
      '989,366,129.54',
    )
    const appearance = await page
      .locator('.gift-management-page')
      .evaluate((element) => ({
        font: getComputedStyle(element).fontFamily,
        systemFont: getComputedStyle(document.body).fontFamily,
      }))
    expect(appearance.font).toBe(appearance.systemFont)
    await expect(
      page.getByRole('button', { name: '登记并继续', exact: true }),
    ).toHaveCSS('background-color', 'rgb(22, 119, 255)')
    for (const statistic of await page.locator('.gift-statistic-card').all()) {
      const number = statistic.locator('.ant-statistic-content')
      expect(
        await number.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
    }
    await expect(page.locator('.gift-statistic-unit').first()).toHaveCSS(
      'font-size',
      '14px',
    )
    await page.locator('.gift-statistics').screenshot({
      path: `test-results/gift-default-style-validation/statistics-${viewport.width}.png`,
    })
    expect(
      await page
        .locator('.page-title')
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe('22px')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`r9-workspace-${viewport.width}.png`),
      fullPage: true,
    })
    await page.getByRole('button', { name: '新建活动', exact: true }).click()
    await page.getByRole('radio', { name: /结婚/ }).check()
    await captureDialog('event-dialog', viewport.width)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await page.getByRole('button', { name: '展示设置', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '生成展示链接', exact: true })
      .click()
    await expect(page.getByLabel('活动展示链接')).not.toHaveValue('')
    await captureDialog('display-settings', viewport.width)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    const row = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: '视觉验收宾客', exact: true }),
    })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await captureDialog('entry-dialog', viewport.width)
    await page
      .getByRole('dialog')
      .getByLabel('更正 / 作废原因')
      .fill('核对礼金')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '保存', exact: true })
      .click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await row.getByRole('button', { name: '操作记录', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('核对礼金')
    await captureDialog('audit-dialog', viewport.width)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click()
    await page.goto('/gift-registry/events')
    await expect(
      page.getByRole('heading', { name: '活动管理', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`r9-event-management-${viewport.width}.png`),
      fullPage: true,
    })
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
