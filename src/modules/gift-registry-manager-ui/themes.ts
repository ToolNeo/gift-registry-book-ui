import type { EventType } from './types'

/** Event type is the single preset value used by form cards, preview and public display. */
export const eventPresets: { value: EventType; ornament: string }[] = [
  { value: 'WEDDING', ornament: '囍' },
  { value: 'FUNERAL', ornament: '' },
  { value: 'BIRTHDAY', ornament: '寿' },
  { value: 'FULL_MOON', ornament: '月' },
  { value: 'HUNDRED_DAYS', ornament: '百' },
  { value: 'FIRST_BIRTHDAY', ornament: '岁' },
  { value: 'ENGAGEMENT', ornament: '缘' },
  { value: 'HOUSEWARMING', ornament: '乔' },
  { value: 'GRADUATION', ornament: '学' },
  { value: 'BUSINESS_OPENING', ornament: '兴' },
]
