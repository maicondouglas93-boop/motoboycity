import type {
  AdminCompanyDetail,
  AdminCompanyListItem,
  AdminCompanyRegistrationOptions,
  AdminPasswordChangeResult,
  ApproveCompanyResult,
  CompanyStatus,
  RegisterCompanyResult,
} from '@motoboycity/types';
import type {
  ChangeAdminPasswordPayload,
  CreateAdminCompanyPayload,
  UpdateCompanyProfilePayload,
  UpsertCompanyAddressPayload,
  AdminUpdateCompanyPayload,
  AdminCompanyAddressPayload,
  AdminCreateCompanyMemberPayload,
  AdminUpdateCompanyMemberPayload,
  AdminUpdateCompanyBillingSettingsPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export interface AdminCompaniesApiConfig {
  baseUrl: string;
}

export function createAdminCompaniesApi({ baseUrl }: AdminCompaniesApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async registrationOptions(accessToken: string): Promise<AdminCompanyRegistrationOptions> {
      const response = await fetch(`${baseUrl}/admin/companies/registration-options`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminCompanyRegistrationOptions>(response);
    },

    async create(
      accessToken: string,
      payload: CreateAdminCompanyPayload,
    ): Promise<RegisterCompanyResult> {
      const response = await fetch(`${baseUrl}/admin/companies`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<RegisterCompanyResult>(response);
    },

    async list(accessToken: string, status?: CompanyStatus): Promise<AdminCompanyListItem[]> {
      const query = status ? `?status=${status}` : '';
      const response = await fetch(`${baseUrl}/admin/companies${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminCompanyListItem[]>(response);
    },

    async detail(accessToken: string, companyId: string): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async approve(accessToken: string, companyId: string): Promise<ApproveCompanyResult> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/approve`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<ApproveCompanyResult>(response);
    },

    async updateProfile(
      accessToken: string,
      companyId: string,
      payload: UpdateCompanyProfilePayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/profile`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async upsertPrimaryAddress(
      accessToken: string,
      companyId: string,
      payload: UpsertCompanyAddressPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/address`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async update(
      accessToken: string,
      companyId: string,
      payload: AdminUpdateCompanyPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async updateBillingSettings(
      accessToken: string,
      companyId: string,
      payload: AdminUpdateCompanyBillingSettingsPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/billing-settings`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async addAddress(
      accessToken: string,
      companyId: string,
      payload: AdminCompanyAddressPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/addresses`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async updateAddress(
      accessToken: string,
      companyId: string,
      addressId: string,
      payload: AdminCompanyAddressPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(
        `${baseUrl}/admin/companies/${companyId}/addresses/${addressId}`,
        {
          method: 'PUT',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async deleteAddress(
      accessToken: string,
      companyId: string,
      addressId: string,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(
        `${baseUrl}/admin/companies/${companyId}/addresses/${addressId}`,
        { method: 'DELETE', headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async addMember(
      accessToken: string,
      companyId: string,
      payload: AdminCreateCompanyMemberPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/team-members`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async updateMember(
      accessToken: string,
      companyId: string,
      memberId: string,
      payload: AdminUpdateCompanyMemberPayload,
    ): Promise<AdminCompanyDetail> {
      const response = await fetch(
        `${baseUrl}/admin/companies/${companyId}/team-members/${memberId}`,
        {
          method: 'PUT',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async setMemberActive(
      accessToken: string,
      companyId: string,
      memberId: string,
      active: boolean,
    ): Promise<AdminCompanyDetail> {
      const action = active ? 'reactivate' : 'deactivate';
      const response = await fetch(
        `${baseUrl}/admin/companies/${companyId}/team-members/${memberId}/${action}`,
        { method: 'PATCH', headers: withAuth(accessToken) },
      );
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async suspend(accessToken: string, companyId: string): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/suspend`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async reactivate(accessToken: string, companyId: string): Promise<AdminCompanyDetail> {
      const response = await fetch(`${baseUrl}/admin/companies/${companyId}/reactivate`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminCompanyDetail>(response);
    },

    async changeMemberPassword(
      accessToken: string,
      companyId: string,
      memberId: string,
      payload: ChangeAdminPasswordPayload,
    ): Promise<AdminPasswordChangeResult> {
      const response = await fetch(
        `${baseUrl}/admin/companies/${companyId}/team-members/${memberId}/password`,
        {
          method: 'PATCH',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminPasswordChangeResult>(response);
    },
  };
}
