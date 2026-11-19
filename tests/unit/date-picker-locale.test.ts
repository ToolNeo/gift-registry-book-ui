import { describe, expect, it } from 'vitest'
import '@/app/App.vue'
import generateConfig from 'ant-design-vue/es/vc-picker/generate/dayjs'

describe('date language data at the application boundary', () => {
  it('provides Chinese months and weekdays to every Ant Design date picker', () => {
    expect(generateConfig.locale.getShortWeekDays('zh_CN')).toEqual([
      '日', '一', '二', '三', '四', '五', '六',
    ])
    expect(generateConfig.locale.getShortMonths('zh_CN')).toEqual([
      '1月', '2月', '3月', '4月', '5月', '6月',
      '7月', '8月', '9月', '10月', '11月', '12月',
    ])
  })

  it('retains English data when the configured language changes', () => {
    expect(generateConfig.locale.getShortWeekDays('en_US')).toEqual([
      'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa',
    ])
    expect(generateConfig.locale.getShortMonths('en_US')[0]).toBe('Jan')
  })
})
