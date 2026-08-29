import type {
  AdminDriverListItem,
  AdminDriverDetail,
  AdminDriverPunishmentItem,
  AdminDriverRegistrationOptions,
  AdminPasswordChangeResult,
  DriverAccountStatus,
  DriverAccountStatusResult,
  DriverApprovalStatus,
  DriverReviewResult,
  DriverServiceTypesResult,
  RegisterDriverResult,
  ReplaceDriverServiceTypesPayload,
} from '@motoboycity/types';
import type {
  AdminReviewDriverDocumentPayload,
  AdminUpdateDriverPayload,
  ChangeAdminPasswordPayload,
  CreateAdminDriverPayload,
  RevokeDriverPunishmentPayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';

export interface AdminDriversApiConfig {
  baseUrl: string;
}

export function createAdminDriversApi({ baseUrl }: AdminDriversApiConfig) {
  function withAuth(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  return {
    async registrationOptions(accessToken: string): Promise<AdminDriverRegistrationOptions> {
      const response = await fetch(`${baseUrl}/admin/drivers/registration-options`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverRegistrationOptions>(response);
    },

    async create(
      accessToken: string,
      payload: CreateAdminDriverPayload,
    ): Promise<RegisterDriverResult> {
      const response = await fetch(`${baseUrl}/admin/drivers`, {
        method: 'POST',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<RegisterDriverResult>(response);
    },

    async list(
      accessToken: string,
      filters?: { approvalStatus?: DriverApprovalStatus; accountStatus?: DriverAccountStatus },
    ): Promise<AdminDriverListItem[]> {
      const params = new URLSearchParams();
      if (filters?.approvalStatus) params.set('approvalStatus', filters.approvalStatus);
      if (filters?.accountStatus) params.set('accountStatus', filters.accountStatus);
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`${baseUrl}/admin/drivers${query}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverListItem[]>(response);
    },

    async detail(accessToken: string, driverId: string): Promise<AdminDriverDetail> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverDetail>(response);
    },

    async update(
      accessToken: string,
      driverId: string,
      payload: AdminUpdateDriverPayload,
    ): Promise<AdminDriverDetail> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminDriverDetail>(response);
    },

    async uploadDocument(
      accessToken: string,
      driverId: string,
      formData: FormData,
    ): Promise<AdminDriverDetail> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/documents`, {
        method: 'POST',
        headers: withAuth(accessToken),
        body: formData,
      });
      return parseJsonOrThrow<AdminDriverDetail>(response);
    },

    async reviewDocument(
      accessToken: string,
      driverId: string,
      documentId: string,
      payload: AdminReviewDriverDocumentPayload,
    ): Promise<AdminDriverDetail> {
      const response = await fetch(
        `${baseUrl}/admin/drivers/${driverId}/documents/${documentId}/review`,
        {
          method: 'PATCH',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminDriverDetail>(response);
    },

    async deleteDocument(
      accessToken: string,
      driverId: string,
      documentId: string,
    ): Promise<AdminDriverDetail> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverDetail>(response);
    },

    async approve(accessToken: string, driverId: string): Promise<DriverReviewResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/approve`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverReviewResult>(response);
    },

    async reject(accessToken: string, driverId: string): Promise<DriverReviewResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/reject`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverReviewResult>(response);
    },

    async suspend(accessToken: string, driverId: string): Promise<DriverAccountStatusResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/suspend`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverAccountStatusResult>(response);
    },

    async block(accessToken: string, driverId: string): Promise<DriverAccountStatusResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/block`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverAccountStatusResult>(response);
    },

    async reactivate(accessToken: string, driverId: string): Promise<DriverAccountStatusResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/reactivate`, {
        method: 'PATCH',
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<DriverAccountStatusResult>(response);
    },

    async changePassword(
      accessToken: string,
      driverId: string,
      payload: ChangeAdminPasswordPayload,
    ): Promise<AdminPasswordChangeResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/password`, {
        method: 'PATCH',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<AdminPasswordChangeResult>(response);
    },

    async replaceServiceTypes(
      accessToken: string,
      driverId: string,
      payload: ReplaceDriverServiceTypesPayload,
    ): Promise<DriverServiceTypesResult> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/service-types`, {
        method: 'PUT',
        headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow<DriverServiceTypesResult>(response);
    },

    async punishments(accessToken: string, driverId: string): Promise<AdminDriverPunishmentItem[]> {
      const response = await fetch(`${baseUrl}/admin/drivers/${driverId}/punishments`, {
        headers: withAuth(accessToken),
      });
      return parseJsonOrThrow<AdminDriverPunishmentItem[]>(response);
    },

    async revokePunishment(
      accessToken: string,
      driverId: string,
      punishmentId: string,
      payload: RevokeDriverPunishmentPayload,
    ): Promise<AdminDriverPunishmentItem> {
      const response = await fetch(
        `${baseUrl}/admin/drivers/${driverId}/punishments/${punishmentId}/revoke`,
        {
          method: 'POST',
          headers: { ...withAuth(accessToken), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      return parseJsonOrThrow<AdminDriverPunishmentItem>(response);
    },
  };
}
