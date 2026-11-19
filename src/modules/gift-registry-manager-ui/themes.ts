import type { EventType } from './types'

/** Event type is the single preset value used by form cards, preview and public display. */
export const eventPresets: { value: EventType; ornament: string }[] = [
  { value: 'WEDDING', ornament: '囍' },
  { value: 'FUNERAL', ornament: '' },
  { value: 'BIRTHDAY', ornament: '寿' },
]
