import { expect, type Locator } from '@playwright/test'

/** Confirm bundled branding assets without depending on Vite's development or build URL prefix. */
export async function expectDefaultBrandingAsset(
  locator: Locator,
  kind: 'logo' | 'ico' | 'background',
  attribute = 'src',
) {
  const source = await locator.getAttribute(attribute)
  expect(source).toBeTruthy()
  let svg: string
  if (source!.startsWith('data:image/svg+xml,')) {
    svg = decodeURIComponent(source!.slice('data:image/svg+xml,'.length))
  } else if (source!.startsWith('data:image/svg+xml;base64,')) {
    svg = Buffer.from(source!.slice('data:image/svg+xml;base64,'.length), 'base64').toString()
  } else {
    const response = await locator.page().request.get(source!)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    svg = await response.text()
  }
  const dimensions = kind === 'background' ? '1400 1080' : '256 256'
  const title = kind === 'background' ? '电子礼簿登录背景 · 礼有往来，情有所记' : '电子礼簿标志'
  expect(svg).toContain(`<title>${title}</title>`)
  expect(svg).toMatch(new RegExp(`viewBox=["']0 0 ${dimensions}["']`))
}
