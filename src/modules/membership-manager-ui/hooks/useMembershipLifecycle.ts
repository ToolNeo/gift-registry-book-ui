import { onBeforeUnmount, onMounted } from 'vue'
import { useMembership } from '../stores/membership'

/** Refresh on return to the app so a dormant page cannot keep stale membership controls. */
export function useMembershipLifecycle(
  refreshAdditional?: () => Promise<void>,
) {
  const membership = useMembership()
  const refresh = () => {
    if (!document.hidden) {
      void membership.load()
      void refreshAdditional?.()
    }
  }
  onMounted(() => {
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })
  return membership
}
