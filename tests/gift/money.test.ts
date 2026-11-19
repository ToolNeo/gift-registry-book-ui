import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  parseAmountCents,
  uppercaseRmb,
} from '@/modules/gift-registry-manager-ui/utils/money'

describe('exact gift money', () => {
  it('round trips cents and never rounds invalid amounts into valid records', () => {
    expect(parseAmountCents('1.23')! + parseAmountCents('2.00')!).toBe(323)
    expect(parseAmountCents(' 0001.2 ')).toBe(120)
    expect(parseAmountCents('999999999.99')).toBe(99999999999)
    for (const value of [
      '',
      '0',
      '-1',
      '0.001',
      '1.239',
      '1e2',
      '1,000',
      '1000000000.00',
    ])
      expect(parseAmountCents(value), value).toBeUndefined()
    for (const cents of [1, 10, 101, 123, 10001, 100000001, 99999999999])
      expect(parseAmountCents(formatAmount(cents))).toBe(cents)
  })

  it.each([
    [0, '零元整'],
    [1, '零元壹分'],
    [10, '零元壹角'],
    [101, '壹元零壹分'],
    [123, '壹元贰角叁分'],
    [10000, '壹佰元整'],
    [1000100, '壹万零壹元整'],
    [10001000100, '壹亿零壹万零壹元整'],
    [99999999999, '玖亿玖仟玖佰玖拾玖万玖仟玖佰玖拾玖元玖角玖分'],
  ])('writes %i cents as %s', (cents, text) =>
    expect(uppercaseRmb(cents)).toBe(text),
  )
})
