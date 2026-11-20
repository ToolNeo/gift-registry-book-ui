import { request } from '@/shared/api/client'
import type { PageResult, Query, RequestOptions } from '@/shared/api/types'
import type {
  AuthorizationCode,
  CodeDelivery,
  IssueInput,
  IssueResult,
  MembershipAccount,
  MembershipHistory,
  MembershipPackage,
  MembershipRecipient,
  MembershipStatus,
} from '../types'

const root = '/membership'
export const membershipApi = {
  packages: async (options?: RequestOptions) =>
    (
      await request.get<MembershipPackage[]>(
        `${root}/packages`,
        undefined,
        options,
      )
    ).result,
  me: async (options?: RequestOptions) =>
    (await request.get<MembershipStatus>(`${root}/me`, undefined, options))
      .result,
  adminPackages: async (options?: RequestOptions) =>
    (
      await request.get<MembershipPackage[]>(
        `${root}/admin/packages`,
        undefined,
        options,
      )
    ).result,
  redeem: async (code: string, requestId: string) =>
    (
      await request.post<MembershipStatus>(`${root}/redeem`, {
        code,
        requestId,
      })
    ).result,
  history: async (query: Query, options?: RequestOptions) =>
    (
      await request.post<PageResult<MembershipHistory>>(
        `${root}/history/_query`,
        query,
        options,
      )
    ).result,
  accounts: async (query: Query, options?: RequestOptions) =>
    (
      await request.post<PageResult<MembershipAccount>>(
        `${root}/admin/accounts/_query`,
        query,
        options,
      )
    ).result,
  codes: async (query: Query, options?: RequestOptions) =>
    (
      await request.post<PageResult<AuthorizationCode>>(
        `${root}/admin/codes/_query`,
        query,
        options,
      )
    ).result,
  recipients: async (search: string, options?: RequestOptions) =>
    (
      await request.post<MembershipRecipient[]>(
        `${root}/admin/recipients/_query`,
        { search },
        options,
      )
    ).result,
  delivery: async (id: string, options?: RequestOptions) =>
    (
      await request.get<CodeDelivery>(
        `${root}/admin/codes/${encodeURIComponent(id)}/delivery`,
        undefined,
        options,
      )
    ).result,
  issue: async (input: IssueInput) =>
    (await request.post<IssueResult>(`${root}/admin/codes`, input)).result,
  revoke: async (id: string) =>
    (
      await request.post<boolean>(
        `${root}/admin/codes/${encodeURIComponent(id)}/revoke`,
      )
    ).result,
  reissue: async (id: string, requestId: string) =>
    (
      await request.post<IssueResult>(
        `${root}/admin/codes/${encodeURIComponent(id)}/reissue`,
        {
          requestId,
        },
      )
    ).result,
}
