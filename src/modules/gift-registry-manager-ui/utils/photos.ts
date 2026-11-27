import { config } from '@/shared/config'

/** Stored URLs use the API mount, which may live on another origin or use a different prefix. */
export function resolveActivityPhotoUrl(
  value?: string | null,
  apiBase = config.apiBase,
): string {
  if (!value) return ''
  if (/^(https?:|blob:)/i.test(value)) return value
  if (!value.startsWith('/') || value.startsWith('//')) return ''
  const path = value.replace(/^\/api(?=\/)/, '')
  return `${apiBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
