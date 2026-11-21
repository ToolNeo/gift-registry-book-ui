import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { useQueryList } from '@/shared/composables/useQueryList'
import { useTask } from '@/shared/composables/useTask'
import { useResource } from '@/shared/composables/useResource'
import { saved } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'
import { membershipApi } from '../api'
import { useMembershipRecipients } from './useMembershipRecipients'
import { useCodeDelivery } from './useCodeDelivery'
import { useMembershipStatistics } from './useMembershipStatistics'
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
  const statistics = useMembershipStatistics()
  let active = true
  let scope = 0
  let accountScope = 0
  onBeforeUnmount(() => {
    active = false
    scope++
    accountScope++
  })
  const packages = useResource<MembershipPackage[]>(
    (signal) => membershipApi.adminPackages({ signal, silent: true }),
    [],
  )
  onMounted(() => {
    if (permissions.can(['membership-admin:query', 'membership-admin:issue']))
      void packages.load()
  })
  const accounts = useQueryList(
    async (query, options) => {
      const epoch = accountScope
      const result = await membershipApi.accounts(query, options)
      return {
        ...result,
        data:
          epoch === accountScope
            ? result.data.map((item) => ({ ...item, id: item.userId }))
            : [],
        total: epoch === accountScope ? result.total : 0,
      }
    },
    { immediate: permissions.can('membership-admin:query') },
  )
  const codes = useQueryList(
    async (query, options) => {
      const epoch = accountScope
      const result = await membershipApi.codes(query, options)
      return epoch === accountScope ? result : { ...result, data: [], total: 0 }
    },
    {
      immediate: permissions.can('membership-admin:query'),
    },
  )
  const task = useTask()
  const issueOpen = ref(false)
  const issued = shallowRef<IssueResult>()
  const notice = ref('')
  const recipients = useMembershipRecipients(
    () => issueOpen.value && permissions.can('membership-admin:issue'),
  )
  const delivery = useCodeDelivery(issued, (status) => {
    codes.data.value = {
      ...codes.data.value,
      data: codes.data.value.data.map((item) =>
        item.id === status.codeId
          ? {
              ...item,
              recipientEmail: status.recipientEmail,
              deliveryStatus: status.deliveryStatus,
            }
          : item,
      ),
    }
  })
  const draft = reactive({
    username: '',
    email: '',
    packageId: undefined as PackageId | undefined,
    paymentReference: '',
  })
  let pending: IssueInput | undefined
  const reissues = new Map<string, string>()
  function clearIssue() {
    recipients.clear()
    Object.assign(draft, {
      username: '',
      email: '',
      packageId: undefined,
      paymentReference: '',
    })
    pending = undefined
    task.error.value = ''
    notice.value = ''
  }
  function closeIssue() {
    scope++
    issueOpen.value = false
    clearIssue()
  }
  function openIssue() {
    closeIssue()
    issueOpen.value = true
  }
  function closeIssued() {
    issued.value = undefined
  }
  watch(
    () => session.user?.id,
    () => {
      accountScope++
      closeIssue()
      closeIssued()
      reissues.clear()
      accounts.data.value = { ...accounts.data.value, data: [], total: 0 }
      codes.data.value = { ...codes.data.value, data: [], total: 0 }
    },
    { flush: 'sync' },
  )
  async function searchRecipients(search: string) {
    // Select clears its search text after selection; retain that verified choice.
    if (!search.trim() && recipients.selected.value) return
    draft.username = ''
    draft.email = ''
    await recipients.search(search)
  }
  function selectRecipient(value: unknown) {
    recipients.select(value)
    draft.username = recipients.selected.value?.username || ''
    draft.email = recipients.selected.value?.email || ''
  }
  async function showIssued(
    result: IssueResult,
    userId: string | undefined,
    epoch: number,
  ) {
    if (!active || epoch !== scope || userId !== session.user?.id) return
    issueOpen.value = false
    clearIssue()
    if (result.code) issued.value = result
    else notice.value = t('membership.replayHint')
    void saved(t('membership.issued'))
    if (permissions.can('membership-admin:query'))
      await Promise.all([codes.load(), accounts.load(), statistics.load()])
  }
  async function issue() {
    if (!permissions.can('membership-admin:issue') || !draft.packageId) return
    const recipient = recipients.selected.value
    if (
      !recipient ||
      recipient.username !== draft.username ||
      !recipient.email ||
      recipient.email !== draft.email
    ) {
      task.error.value = t('membership.verifiedEmailRequired')
      return
    }
    await task.run(async () => {
      const userId = session.user?.id
      const epoch = scope
      const input = {
        username: draft.username.trim(),
        email: draft.email,
        packageId: draft.packageId!,
        paymentReference: draft.paymentReference.trim(),
      }
      if (
        !pending ||
        pending.username !== input.username ||
        pending.email !== input.email ||
        pending.packageId !== input.packageId ||
        pending.paymentReference !== input.paymentReference
      )
        pending = { ...input, requestId: crypto.randomUUID() }
      try {
        await showIssued(await membershipApi.issue(pending), userId, epoch)
      } catch (cause) {
        if (active && epoch === scope && userId === session.user?.id)
          throw cause
      }
      pending = undefined
    })
  }
  async function revoke(code: AuthorizationCode) {
    if (!permissions.can('membership-admin:revoke') || code.status !== 'UNUSED')
      return
    await task.run(async () => {
      const userId = session.user?.id
      const epoch = accountScope
      await membershipApi.revoke(code.id)
      if (!active || epoch !== accountScope || userId !== session.user?.id)
        return
      void saved(t('membership.revoked'))
      if (permissions.can('membership-admin:query'))
        await Promise.all([codes.load(), statistics.load()])
    })
  }
  async function reissue(code: AuthorizationCode) {
    if (!permissions.can('membership-admin:issue') || code.status !== 'UNUSED')
      return
    await task.run(async () => {
      const requestId = reissues.get(code.id) || crypto.randomUUID()
      const userId = session.user?.id
      const epoch = scope
      reissues.set(code.id, requestId)
      try {
        await showIssued(
          await membershipApi.reissue(code.id, requestId),
          userId,
          epoch,
        )
      } catch (cause) {
        if (active && epoch === scope && userId === session.user?.id)
          throw cause
      }
      reissues.delete(code.id)
    })
  }
  return {
    packages,
    accounts,
    codes,
    statistics,
    task,
    issueOpen,
    issued,
    notice,
    recipients,
    delivery,
    draft,
    openIssue,
    closeIssue,
    closeIssued,
    searchRecipients,
    selectRecipient,
    issue,
    revoke,
    reissue,
  }
}
