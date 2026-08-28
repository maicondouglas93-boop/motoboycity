import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  AiqfomeConnectResult,
  AiqfomeDisconnectResult,
  CompanyAiqfomeIntegration,
} from '@motoboycity/types';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiqfomeClient, AiqfomeProviderError, normalizeDocument } from './aiqfome-client';
import {
  AIQFOME_AUTHORIZE_URL,
  AIQFOME_SCOPES,
  hasRequiredAiqfomeScopes,
  readAiqfomeRuntimeConfig,
  requireAiqfomeRuntimeConfig,
  resolveCompanyWebUrl,
} from './aiqfome.config';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import { AiqfomeOAuthStateService } from './aiqfome-oauth-state.service';
import {
  emptyAiqfomeIntegrationConfig,
  parseAiqfomeIntegrationConfig,
  type AiqfomeIntegrationConfig,
  type AiqfomeOauthState,
} from './aiqfome.schemas';
import type { AiqfomeOauthCallbackQuery } from '@motoboycity/validation';
import type { UpdateAiqfomeSettingsPayload } from '@motoboycity/validation';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { AiqfomeWebhookService } from './aiqfome-webhook.service';

@Injectable()
export class AiqfomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: AiqfomeClient,
    private readonly credentials: AiqfomeCredentialsService,
    private readonly oauthState: AiqfomeOAuthStateService,
    private readonly tokenService: AiqfomeTokenService,
    private readonly webhookService: AiqfomeWebhookService,
  ) {}

  async getForCompany(user: User): Promise<CompanyAiqfomeIntegration> {
    const membership = await this.resolveMembership(user);
    const integration = await this.prisma.integration.findUnique({
      where: { companyId_provider: { companyId: membership.companyId, provider: 'AIQFOME' } },
      include: { credential: { select: { id: true } } },
    });
    const storedConfig = parseAiqfomeIntegrationConfig(integration?.config);
    const missingCredential = integration?.status === 'CONNECTED' && !integration.credential;
    const global = await this.prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: { aiqfomeDispatchDelayMinutes: true },
    });
    const effectiveDelay =
      storedConfig.dispatchDelayMinutes ?? global?.aiqfomeDispatchDelayMinutes ?? null;
    const status = missingCredential ? 'ERROR' : (integration?.status ?? 'DISCONNECTED');

    return {
      provider: 'AIQFOME',
      status,
      configured: readAiqfomeRuntimeConfig(this.config) !== null,
      operationalReady:
        status === 'CONNECTED' &&
        storedConfig.serviceTypeId !== null &&
        effectiveDelay !== null &&
        storedConfig.webhook.status === 'ACTIVE',
      canManage: membership.role === 'OWNER',
      store: storedConfig.store,
      dispatchTrigger: 'NEW_ORDER_DELAYED',
      acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
      serviceTypeId: storedConfig.serviceTypeId,
      dispatchDelayMinutes: storedConfig.dispatchDelayMinutes,
      effectiveDispatchDelayMinutes: effectiveDelay,
      delaySource:
        effectiveDelay === null
          ? null
          : storedConfig.dispatchDelayMinutes !== null
            ? 'COMPANY'
            : 'ADMIN',
      webhookStatus: storedConfig.webhook.status,
      connectedAt: integration?.connectedAt?.toISOString() ?? null,
      lastSyncAt: integration?.lastSyncAt?.toISOString() ?? null,
      errorCode: missingCredential ? 'MISSING_CREDENTIAL' : storedConfig.errorCode,
    };
  }

  async connect(user: User): Promise<AiqfomeConnectResult> {
    const membership = await this.resolveOwnerMembership(user);
    const runtime = requireAiqfomeRuntimeConfig(this.config);
    const oauthAttemptId = randomUUID();
    const integration = await this.prisma.integration.upsert({
      where: { companyId_provider: { companyId: membership.companyId, provider: 'AIQFOME' } },
      create: {
        companyId: membership.companyId,
        provider: 'AIQFOME',
        status: 'DISCONNECTED',
        config: emptyAiqfomeIntegrationConfig() as Prisma.InputJsonValue,
      },
      update: {},
      select: { id: true },
    });
    let state = '';
    await this.tokenService.runExclusive(integration.id, async () => {
      const activated = await this.prisma.integration.updateMany({
        where: {
          id: integration.id,
          companyId: membership.companyId,
          provider: 'AIQFOME',
        },
        data: { oauthAttemptId },
      });
      if (activated.count !== 1) {
        throw new AiqfomeProviderError('INTEGRATION_NOT_FOUND');
      }

      try {
        state = await this.oauthState.create({
          companyId: membership.companyId,
          userId: user.id,
          integrationId: integration.id,
          oauthAttemptId,
        });
      } catch (error) {
        await this.prisma.integration.updateMany({
          where: {
            id: integration.id,
            companyId: membership.companyId,
            provider: 'AIQFOME',
            oauthAttemptId,
          },
          data: { oauthAttemptId: null },
        });
        throw error;
      }
    });
    const url = new URL(AIQFOME_AUTHORIZE_URL);
    url.searchParams.set('client_id', runtime.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', runtime.redirectUri);
    url.searchParams.set('scope', AIQFOME_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('choose_tenants', 'true');
    return { authorizationUrl: url.toString() };
  }

  async disconnect(user: User): Promise<AiqfomeDisconnectResult> {
    const membership = await this.resolveOwnerMembership(user);
    const integration = await this.prisma.integration.findUnique({
      where: { companyId_provider: { companyId: membership.companyId, provider: 'AIQFOME' } },
      select: { id: true, config: true, status: true },
    });

    if (!integration) return { disconnected: true };

    const storedConfig = parseAiqfomeIntegrationConfig(integration.config);
    if (integration.status === 'CONNECTED' && storedConfig.webhook.status === 'ACTIVE') {
      await this.webhookService.deactivate(integration.id, storedConfig);
    }
    await this.tokenService.runExclusive(integration.id, async () => {
      await this.prisma.$transaction([
        this.prisma.integrationCredential.deleteMany({ where: { integrationId: integration.id } }),
        this.prisma.integration.update({
          where: { id: integration.id },
          data: {
            status: 'DISCONNECTED',
            config: emptyAiqfomeIntegrationConfig() as Prisma.InputJsonValue,
            credentialsRef: null,
            oauthAttemptId: null,
            connectedAt: null,
            lastSyncAt: new Date(),
          },
        }),
      ]);
    });
    return { disconnected: true };
  }

  async updateSettings(
    user: User,
    payload: UpdateAiqfomeSettingsPayload,
  ): Promise<CompanyAiqfomeIntegration> {
    const membership = await this.resolveOwnerMembership(user);
    const integration = await this.prisma.integration.findUnique({
      where: { companyId_provider: { companyId: membership.companyId, provider: 'AIQFOME' } },
      include: { credential: { select: { id: true } }, company: { select: { regionId: true } } },
    });
    if (!integration || integration.status !== 'CONNECTED' || !integration.credential) {
      throw new ConflictException('Conecte uma loja aiqfome antes de configurar a importacao.');
    }

    const current = parseAiqfomeIntegrationConfig(integration.config);
    const next: AiqfomeIntegrationConfig = {
      ...current,
      ...(payload.serviceTypeId !== undefined && { serviceTypeId: payload.serviceTypeId }),
      ...(payload.dispatchDelayMinutes !== undefined && {
        dispatchDelayMinutes: payload.dispatchDelayMinutes,
      }),
      errorCode: null,
    };
    if (next.serviceTypeId) {
      const serviceType = await this.prisma.serviceType.findFirst({
        where: { id: next.serviceTypeId, active: true },
        select: { id: true },
      });
      if (!serviceType) throw new ConflictException('A modalidade selecionada nao esta ativa.');
      const pricing = await this.prisma.pricingTable.findFirst({
        where: {
          regionId: integration.company!.regionId,
          serviceTypeId: next.serviceTypeId,
          active: true,
          OR: [{ companyId: membership.companyId }, { companyId: null }],
        },
        select: { id: true },
      });
      if (!pricing) {
        throw new ConflictException('Nao existe tabela de preco ativa para esta modalidade.');
      }
    }
    const global = await this.prisma.platformSettings.findUnique({
      where: { id: 'global' },
      select: { aiqfomeDispatchDelayMinutes: true },
    });
    const effectiveDelay = next.dispatchDelayMinutes ?? global?.aiqfomeDispatchDelayMinutes ?? null;
    try {
      next.webhook =
        next.serviceTypeId && effectiveDelay !== null
          ? await this.webhookService.activate(integration.id, next)
          : await this.webhookService.deactivate(integration.id, next);
    } catch (error) {
      const errorCode = safeCallbackErrorCode(error);
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: {
          config: {
            ...next,
            webhook: { ...next.webhook, status: 'ERROR', updatedAt: new Date().toISOString() },
            errorCode,
          } as Prisma.InputJsonValue,
        },
      });
      throw error;
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { config: next as Prisma.InputJsonValue, lastSyncAt: new Date() },
    });
    return this.getForCompany(user);
  }

  async handleCallback(query: AiqfomeOauthCallbackQuery): Promise<string> {
    if (!query.state) return this.callbackRedirect('error', 'INVALID_STATE');

    const state = await this.oauthState.consume(query.state);
    if (!state) return this.callbackRedirect('error', 'INVALID_OR_EXPIRED_STATE');

    const activeAttempt = await this.prisma.integration.findFirst({
      where: {
        id: state.integrationId,
        companyId: state.companyId,
        provider: 'AIQFOME',
        oauthAttemptId: state.oauthAttemptId,
      },
      select: { id: true },
    });
    if (!activeAttempt) {
      return this.callbackRedirect('error', 'INVALID_OR_EXPIRED_STATE');
    }

    if (query.error || !query.code) {
      await this.markError(state, 'AUTHORIZATION_DENIED');
      return this.callbackRedirect('error', 'AUTHORIZATION_DENIED');
    }

    const membership = await this.prisma.companyTeamMember.findFirst({
      where: {
        userId: state.userId,
        companyId: state.companyId,
        active: true,
        role: 'OWNER',
        company: { status: 'ACTIVE' },
      },
      select: { companyId: true, company: { select: { document: true } } },
    });
    if (!membership) {
      await this.markError(state, 'OWNER_ACCESS_REVOKED');
      return this.callbackRedirect('error', 'OWNER_ACCESS_REVOKED');
    }

    try {
      const token = await this.client.exchangeCode(query.code);
      const scopes = token.scope.split(/\s+/).filter(Boolean);
      assertRequiredScopes(scopes);
      const store = await this.client.resolveAuthorizedStore(token.access_token);

      if (normalizeDocument(membership.company.document) !== store.document) {
        await this.markError(state, 'STORE_DOCUMENT_MISMATCH');
        return this.callbackRedirect('error', 'STORE_DOCUMENT_MISMATCH');
      }

      const previousConfig = parseAiqfomeIntegrationConfig(
        (
          await this.prisma.integration.findUnique({
            where: { id: state.integrationId },
            select: { config: true },
          })
        )?.config,
      );
      if (
        previousConfig.webhook.status === 'ACTIVE' &&
        previousConfig.store &&
        previousConfig.store.id !== store.id
      ) {
        throw new AiqfomeProviderError('DISCONNECT_BEFORE_CHANGING_STORE');
      }
      const keepActiveWebhook =
        previousConfig.webhook.status === 'ACTIVE' && previousConfig.store?.id === store.id;
      const integrationConfig: AiqfomeIntegrationConfig = {
        ...previousConfig,
        version: 2,
        dispatchTrigger: 'NEW_ORDER_DELAYED',
        acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
        store,
        scopes,
        webhook: keepActiveWebhook
          ? previousConfig.webhook
          : {
              status: 'INACTIVE',
              secretDigest: null,
              registrations: [],
              updatedAt: null,
            },
        errorCode: null,
      };
      const expiresAt = new Date(Date.now() + token.expires_in * 1000);
      const sealed = this.credentials.seal(state.integrationId, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type,
        scope: scopes,
        expiresAt: expiresAt.toISOString(),
      });

      await this.prisma.$transaction(async (tx) => {
        const credential = await tx.integrationCredential.upsert({
          where: { integrationId: state.integrationId },
          create: { integrationId: state.integrationId, ...sealed },
          update: { ...sealed, tokenVersion: { increment: 1 } },
          select: { id: true },
        });
        const updated = await tx.integration.updateMany({
          where: {
            id: state.integrationId,
            companyId: state.companyId,
            provider: 'AIQFOME',
            oauthAttemptId: state.oauthAttemptId,
          },
          data: {
            status: 'CONNECTED',
            config: integrationConfig as Prisma.InputJsonValue,
            credentialsRef: `database:${credential.id}`,
            oauthAttemptId: null,
            connectedAt: new Date(),
            lastSyncAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          throw new AiqfomeProviderError('INVALID_OR_EXPIRED_STATE');
        }
      });

      return this.callbackRedirect('connected');
    } catch (error) {
      const errorCode = safeCallbackErrorCode(error);
      await this.markError(state, errorCode);
      return this.callbackRedirect('error', errorCode);
    }
  }

  private async resolveMembership(user: User): Promise<{ companyId: string; role: string }> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true, role: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa ativa.');
    }
    return membership;
  }

  private async resolveOwnerMembership(user: User): Promise<{ companyId: string }> {
    const membership = await this.resolveMembership(user);
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException('Somente o responsável pode gerenciar integrações.');
    }
    return { companyId: membership.companyId };
  }

  private async markError(state: AiqfomeOauthState, errorCode: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.integration.findFirst({
        where: {
          id: state.integrationId,
          companyId: state.companyId,
          provider: 'AIQFOME',
          oauthAttemptId: state.oauthAttemptId,
        },
        select: { config: true, status: true },
      });
      if (!existing) return;

      const config = { ...parseAiqfomeIntegrationConfig(existing.config), errorCode };
      await tx.integration.updateMany({
        where: {
          id: state.integrationId,
          companyId: state.companyId,
          provider: 'AIQFOME',
          oauthAttemptId: state.oauthAttemptId,
        },
        data: {
          status: existing.status === 'CONNECTED' ? 'CONNECTED' : 'ERROR',
          config: config as Prisma.InputJsonValue,
          oauthAttemptId: null,
        },
      });
    });
  }

  private callbackRedirect(status: 'connected' | 'error', reason?: string): string {
    const url = new URL('/integracoes', resolveCompanyWebUrl(this.config));
    url.searchParams.set('aiqfome', status);
    if (reason) url.searchParams.set('reason', reason);
    return url.toString();
  }
}

function assertRequiredScopes(scopes: string[]): void {
  if (!hasRequiredAiqfomeScopes(scopes)) {
    throw new AiqfomeProviderError('INSUFFICIENT_SCOPE');
  }
}

function safeCallbackErrorCode(error: unknown): string {
  if (error instanceof AiqfomeProviderError) return error.code;
  return 'OAUTH_CALLBACK_FAILED';
}
