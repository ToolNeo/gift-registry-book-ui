import { t } from '@/shared/i18n'
import type { BackupBundle } from '../types'

/** Decode a local draft without copying its bytes into JSON. The caller owns the returned object URL. */
export async function readActivityPhoto(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024 ||
    !file.size
  )
    throw new Error(t('gift.photoInvalid'))
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () =>
        image.naturalWidth && image.naturalHeight
          ? resolve()
          : reject(new Error(t('gift.photoInvalid')))
      image.onerror = () => reject(new Error(t('gift.photoInvalid')))
      image.src = url
    })
    return url
  } catch (cause) {
    URL.revokeObjectURL(url)
    throw cause
  }
}

/** Backups contain personal records; download only on an explicit action and release the object URL. */
export function downloadBackup(bundle: BackupBundle): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `gift-registry-${bundle.event.eventDate}-${bundle.event.id}.json`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Structural preflight is intentionally small; the server remains the authoritative restore validator. */
export async function readBackup(file: File): Promise<BackupBundle> {
  if (!file.size || file.size > 50 * 1024 * 1024)
    throw new Error(t('gift.restoreInvalid'))
  const value: unknown = JSON.parse(await file.text())
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    !('event' in value) ||
    !('entries' in value) ||
    !Array.isArray(value.entries) ||
    !('audits' in value) ||
    !Array.isArray(value.audits) ||
    !('settings' in value)
  )
    throw new Error(t('gift.restoreInvalid'))
  return value as BackupBundle
}
