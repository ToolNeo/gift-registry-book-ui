import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { useQueryList } from '@/shared/composables/useQueryList'
import { useTask } from '@/shared/composables/useTask'
import { useResource } from '@/shared/composables/useResource'
import { saved } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import { membershipApi } from '../api'
import type {
  AuthorizationCode,
  IssueInput,
  IssueResult,
  MembershipPackage,
  PackageId,
} from '../types'

export function useMembershipManagement() {
  const permissions = usePermissions()
  const session = useSession()
  let active = true
  onBeforeUnmount(() => {
    active = false
  })
  const packages = useResource<MembershipPackage[]>(
    (signal) => membershipApi.adminPackages({ signal, silent: true }),
    [],
  )
  onMounted(() => void packages.load())
  const accounts = useQueryList(async (query, options) => {
    const result = await membershipApi.accounts(query, options)
    return {
      ...result,
      data: result.data.map((item) => ({ ...item, id: item.userId })),
    }
  })
  const codes = useQueryList(membershipApi.codes)
  const task = useTask()
  const issueOpen = ref(false)
  const issued = shallowRef<IssueResult>()
  const notice = ref('')
  const draft = reactive({
    username: '',
    packageId: undefined as PackageId | undefined,
    paymentReference: '',
  })
  let pending: IssueInput | undefined
  const reissues = new Map<string, string>()
  function openIssue() {
    Object.assign(draft, {
      username: '',
      packageId: undefined,
      paymentReference: '',
    })
    pending = undefined
    task.error.value = ''
    notice.value = ''
    issueOpen.value = true
  }
  async function showIssued(result: IssueResult, userId: string | undefined) {
    if (!active || userId !== session.user?.id) return
    issueOpen.value = false
    if (result.code) issued.value = result
    else notice.value = t('membership.replayHint')
    void saved(t('membership.issued'))
    await Promise.all([codes.load(), accounts.load()])
  }
  async function issue() {
    if (!permissions.can('membership-admin:issue') || !draft.packageId) return
    await task.run(async () => {
      const userId = session.user?.id
      const input = {
        username: draft.username.trim(),
        packageId: draft.packageId!,
        paymentReference: draft.paymentReference.trim(),
      }
      if (
        !pending ||
        pending.username !== input.username ||
        pending.packageId !== input.packageId ||
        pending.paymentReference !== input.paymentReference
      )
        pending = { ...input, requestId: crypto.randomUUID() }
      await showIssued(await membershipApi.issue(pending), userId)
      pending = undefined
    })
  }
  async function revoke(code: AuthorizationCode) {
    if (!permissions.can('membership-admin:revoke') || code.status !== 'UNUSED')
      return
    await task.run(async () => {
      await membershipApi.revoke(code.id)
      void saved(t('membership.revoked'))
      await codes.load()
    })
  }
  async function reissue(code: AuthorizationCode) {
    if (!permissions.can('membership-admin:issue') || code.status !== 'UNUSED')
      return
    await task.run(async () => {
      const requestId = reissues.get(code.id) || crypto.randomUUID()
      const userId = session.user?.id
      reissues.set(code.id, requestId)
      await showIssued(await membershipApi.reissue(code.id, requestId), userId)
      reissues.delete(code.id)
    })
  }
  return {
    packages,
    accounts,
    codes,
    task,
    issueOpen,
    issued,
    notice,
    draft,
    openIssue,
    issue,
    revoke,
    reissue,
  }
}
