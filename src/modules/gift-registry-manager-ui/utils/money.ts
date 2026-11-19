const maxCents = 99999999999
const digits = '零壹贰叁肆伍陆柒捌玖'

/** Parse decimal text without floating point multiplication; reject rounding and exponent notation. */
export function parseAmountCents(value: string): number | undefined {
  const text = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return undefined
  const [whole = '', fraction = ''] = text.split('.')
  const cents = Number(`${whole}${fraction.padEnd(2, '0')}`)
  return Number.isSafeInteger(cents) && cents > 0 && cents <= maxCents
    ? cents
    : undefined
}

/** Format the stored integer cents directly so edit round trips preserve every cent. */
export function formatAmount(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** Convert one four-digit group; missing internal places require a single zero. */
function groupUpper(value: number): string {
  const units = ['', '拾', '佰', '仟']
  let output = ''
  let zero = false
  for (let place = 3; place >= 0; place--) {
    const digit = Math.floor(value / 10 ** place) % 10
    if (digit) {
      if (zero && output) output += '零'
      output += `${digits[digit]}${units[place]}`
      zero = false
    } else if (output) zero = true
  }
  return output
}

/** Generate RMB financial numerals from the same integer cents used by storage and totals. */
export function uppercaseRmb(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > maxCents) return ''
  let whole = Math.floor(cents / 100)
  const groups: number[] = []
  do {
    groups.push(whole % 10000)
    whole = Math.floor(whole / 10000)
  } while (whole)
  let result = ''
  let zero = false
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]!
    if (group) {
      if (result && (zero || group < 1000)) result += '零'
      result += groupUpper(group) + ['', '万', '亿'][index]
      zero = false
    } else if (result) zero = true
  }
  result = `${result || '零'}元`
  const jiao = Math.floor((cents % 100) / 10)
  const fen = cents % 10
  if (!jiao && !fen) return `${result}整`
  if (jiao) result += `${digits[jiao]}角`
  if (fen) result += `${!jiao && cents >= 100 ? '零' : ''}${digits[fen]}分`
  return result
}
