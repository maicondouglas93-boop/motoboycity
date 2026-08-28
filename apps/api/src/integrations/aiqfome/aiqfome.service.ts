import { ForbiddenException, Injectable } from '@nestjs/common';
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
import { AiqfomeTokenService } from './aiqfome-token.service';

@Injectable()
export class AiqfomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: AiqfomeClient,
    private readonly credentials: AiqfomeCredentialsService,
    private readonly oauthState: AiqfomeOAuthStateService,
    private readonly tokenService: AiqfomeTokenService,
  ) {}

  async getForCompany(user: User): Promise<CompanyAiqfomeIntegration> {
    const membership = await this.resolveMembership(user);
    const integration = await this.prisma.integration.findUnique({
      where: { companyId_provider: { companyId: membership.companyId, provider: 'AIQFOME' } },
      include: { credential: { select: { id: true } } },
    });
    const storedConfig = parseAiqfomeIntegrationConfig(integration?.config);
    const missingCredential = integration?.status === 'CONNECTED' && !integration.credential;

    return {
      provider: 'AIQFOME',
      status: missingCredential ? 'ERROR' : (integration?.status ?? 'DISCONNECTED'),
      configured: readAiqfomeRuntimeConfig(this.config) !== null,
      canManage: membership.role === 'OWNER',
      store: storedConfig.store,
      dispatchTrigger: 'READY_ORDER',
      acceptedPayment: 'PREPAID_ONLY',
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
      select: { id: true },
    });

    if (!integration) return { disconnected: true };

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

      const integrationConfig: AiqfomeIntegrationConfig = {
        version: 1,
        dispatchTrigger: 'READY_ORDER',
        acceptedPayment: 'PREPAID_ONLY',
        store,
        scopes,
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
