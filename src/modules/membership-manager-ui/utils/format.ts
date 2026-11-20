import dayjs from 'dayjs'
export const membershipDate = (value: number | null | undefined) =>
  value == null ? '--' : dayjs(value).format('YYYY-MM-DD HH:mm:ss')
export const membershipPrice = (cents: number) => `¥${(cents / 100).toFixed(2)}`
