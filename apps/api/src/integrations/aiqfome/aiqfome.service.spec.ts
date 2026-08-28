import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiqfomeClient } from './aiqfome-client';
import { AiqfomeCredentialsService } from './aiqfome-credentials.service';
import { AiqfomeOAuthStateService } from './aiqfome-oauth-state.service';
import { AiqfomeService } from './aiqfome.service';
import { AiqfomeTokenService } from './aiqfome-token.service';
import { AiqfomeWebhookService } from './aiqfome-webhook.service';

describe('AiqfomeService', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const integrationId = '33333333-3333-4333-8333-333333333333';
  const oauthAttemptId = '44444444-4444-4444-8444-444444444444';
  const user = { id: userId, type: 'COMPANY_MEMBER' } as User;
  const runtimeValues: Record<string, string> = {
    AIQFOME_CLIENT_ID: 'client-id',
    AIQFOME_CLIENT_SECRET: 'client-secret',
    AIQFOME_REDIRECT_URI: 'https://api.example.com/integrations/aiqfome/callback',
    AIQFOME_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    COMPANY_WEB_URL: 'https://company.example.com',
  };

  function createSubject(role: 'OWNER' | 'OPERATOR' = 'OWNER') {
    const transactionClient = {
      integrationCredential: {
        upsert: jest.fn().mockResolvedValue({ id: 'credential-1' }),
      },
      integration: {
        findFirst: jest.fn().mockResolvedValue({ config: null, status: 'DISCONNECTED' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      companyTeamMember: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ companyId, role })
          .mockResolvedValue({ companyId, company: { document: '12.345.678/0001-90' } }),
      },
      integration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: integrationId }),
        upsert: jest.fn().mockResolvedValue({ id: integrationId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      integrationCredential: { deleteMany: jest.fn() },
      platformSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      serviceType: { findFirst: jest.fn().mockResolvedValue({ id: 'service-type' }) },
      pricingTable: { findFirst: jest.fn().mockResolvedValue({ id: 'pricing-table' }) },
      $transaction: jest.fn(async (callback: unknown) => {
        if (typeof callback === 'function') {
          return callback(transactionClient);
        }
        return Promise.all(callback as Promise<unknown>[]);
      }),
    };
    const config = {
      get: jest.fn((key: string) => runtimeValues[key]),
    } as unknown as ConfigService;
    const client = {
      exchangeCode: jest.fn().mockResolvedValue({
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        token_type: 'Bearer',
        expires_in: 7200,
        scope: 'aqf:store:read aqf:store:create aqf:order:read aqf:order:create',
      }),
      resolveAuthorizedStore: jest.fn().mockResolvedValue({
        id: '54044',
        name: 'Loja Teste',
        status: 'OPEN',
        document: '12345678000190',
        address: null,
      }),
    };
    const credentials = {
      seal: jest.fn().mockReturnValue({
        encryptedPayload: 'ciphertext',
        iv: 'initial-vector',
        authTag: 'authentication-tag',
        keyVersion: 1,
        expiresAt: new Date('2026-08-28T00:00:00.000Z'),
      }),
    };
    const oauthState = {
      create: jest.fn().mockResolvedValue('s'.repeat(43)),
      consume: jest.fn().mockResolvedValue({
        companyId,
        userId,
        integrationId,
        oauthAttemptId,
        createdAt: '2026-08-27T20:00:00.000Z',
      }),
    };
    const tokenService = {
      runExclusive: jest.fn(async (_id: string, operation: () => Promise<unknown>) => operation()),
    };
    const webhookService = {
      activate: jest.fn(),
      deactivate: jest.fn(),
    };

    return {
      service: new AiqfomeService(
        prisma as unknown as PrismaService,
        config,
        client as unknown as AiqfomeClient,
        credentials as unknown as AiqfomeCredentialsService,
        oauthState as unknown as AiqfomeOAuthStateService,
        tokenService as unknown as AiqfomeTokenService,
        webhookService as unknown as AiqfomeWebhookService,
      ),
      prisma,
      transactionClient,
      client,
      credentials,
      oauthState,
      tokenService,
      webhookService,
    };
  }

  it('gera URL OAuth com state opaco sem expor o client secret', async () => {
    const { service, oauthState, prisma, tokenService } = createSubject();

    const result = await service.connect(user);
    const url = new URL(result.authorizationUrl);

    expect(url.origin + url.pathname).toBe('https://id.magalu.com/login');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe('s'.repeat(43));
    expect(url.searchParams.get('choose_tenants')).toBe('true');
    expect(result.authorizationUrl).not.toContain('client-secret');
    expect(oauthState.create).toHaveBeenCalledWith({
      companyId,
      userId,
      integrationId,
      oauthAttemptId: expect.any(String),
    });
    expect(tokenService.runExclusive).toHaveBeenCalledWith(integrationId, expect.any(Function));
    expect(prisma.integration.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
    expect(prisma.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { oauthAttemptId: expect.any(String) } }),
    );
  });

  it('impede operador de iniciar a conexao', async () => {
    const { service, oauthState } = createSubject('OPERATOR');

    await expect(service.connect(user)).rejects.toThrow(
      'Somente o responsável pode gerenciar integrações.',
    );
    expect(oauthState.create).not.toHaveBeenCalled();
  });

  it('valida loja e grava somente o payload cifrado no callback', async () => {
    const { service, credentials, transactionClient, prisma } = createSubject();
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({
      companyId,
      company: { document: '12.345.678/0001-90' },
    });

    await expect(
      service.handleCallback({ code: 'single-use-code', state: 's'.repeat(43) }),
    ).resolves.toBe('https://company.example.com/integracoes?aiqfome=connected');

    expect(credentials.seal).toHaveBeenCalledWith(
      integrationId,
      expect.objectContaining({ accessToken: 'access-secret', refreshToken: 'refresh-secret' }),
    );
    expect(transactionClient.integrationCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedPayload: 'ciphertext' }),
        update: expect.objectContaining({
          encryptedPayload: 'ciphertext',
          tokenVersion: { increment: 1 },
        }),
      }),
    );
    expect(JSON.stringify(transactionClient.integrationCredential.upsert.mock.calls)).not.toContain(
      'access-secret',
    );
    expect(transactionClient.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ oauthAttemptId }),
        data: expect.objectContaining({ status: 'CONNECTED', oauthAttemptId: null }),
      }),
    );
  });

  it('preserva o webhook ativo ao reautorizar a mesma loja', async () => {
    const { service, prisma, transactionClient, webhookService } = createSubject();
    const activeWebhook = {
      status: 'ACTIVE' as const,
      secretDigest: 'a'.repeat(64),
      registrations: [{ id: 'webhook-1', event: 'new-order' as const }],
      updatedAt: '2026-08-28T14:00:00.000Z',
    };
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({
      companyId,
      company: { document: '12.345.678/0001-90' },
    });
    prisma.integration.findUnique.mockResolvedValue({
      config: {
        version: 2,
        dispatchTrigger: 'NEW_ORDER_DELAYED',
        acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
        store: {
          id: '54044',
          name: 'Loja Teste',
          status: 'OPEN',
          document: '12345678000190',
          address: null,
        },
        scopes: ['aqf:store:read'],
        serviceTypeId: null,
        dispatchDelayMinutes: null,
        webhook: activeWebhook,
        errorCode: null,
      },
    });

    await expect(
      service.handleCallback({ code: 'single-use-code', state: 's'.repeat(43) }),
    ).resolves.toBe('https://company.example.com/integracoes?aiqfome=connected');

    expect(webhookService.deactivate).not.toHaveBeenCalled();
    expect(transactionClient.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({ webhook: activeWebhook }),
        }),
      }),
    );
  });

  it('exige desconectar antes de trocar uma loja com webhook ativo', async () => {
    const { service, prisma, transactionClient } = createSubject();
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({
      companyId,
      company: { document: '12.345.678/0001-90' },
    });
    prisma.integration.findUnique.mockResolvedValue({
      config: {
        version: 2,
        dispatchTrigger: 'NEW_ORDER_DELAYED',
        acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
        store: {
          id: 'old-store',
          name: 'Loja anterior',
          status: 'OPEN',
          document: '12345678000190',
          address: null,
        },
        scopes: [],
        serviceTypeId: null,
        dispatchDelayMinutes: null,
        webhook: {
          status: 'ACTIVE',
          secretDigest: 'a'.repeat(64),
          registrations: [{ id: 'webhook-1', event: 'new-order' }],
          updatedAt: '2026-08-28T14:00:00.000Z',
        },
        errorCode: null,
      },
    });

    await expect(
      service.handleCallback({ code: 'single-use-code', state: 's'.repeat(43) }),
    ).resolves.toBe(
      'https://company.example.com/integracoes?aiqfome=error&reason=DISCONNECT_BEFORE_CHANGING_STORE',
    );

    expect(transactionClient.integrationCredential.upsert).not.toHaveBeenCalled();
  });

  it('invalida o callback pendente quando a loja e desconectada', async () => {
    const { service, prisma, tokenService } = createSubject();
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({ companyId, role: 'OWNER' });
    prisma.integration.findUnique.mockResolvedValue({ id: integrationId });

    await expect(service.disconnect(user)).resolves.toEqual({ disconnected: true });

    expect(prisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: integrationId },
        data: expect.objectContaining({ oauthAttemptId: null, status: 'DISCONNECTED' }),
      }),
    );
    expect(tokenService.runExclusive).toHaveBeenCalledWith(integrationId, expect.any(Function));
  });

  it('nao troca uma conexao valida para erro quando a reconexao e cancelada', async () => {
    const { service, transactionClient } = createSubject();
    transactionClient.integration.findFirst.mockResolvedValue({
      config: null,
      status: 'CONNECTED',
    });

    await expect(
      service.handleCallback({ error: 'access_denied', state: 's'.repeat(43) }),
    ).resolves.toBe(
      'https://company.example.com/integracoes?aiqfome=error&reason=AUTHORIZATION_DENIED',
    );

    expect(transactionClient.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONNECTED', oauthAttemptId: null }),
      }),
    );
  });

  it('rejeita callback de uma tentativa que ja foi invalidada', async () => {
    const { service, prisma, client } = createSubject();
    prisma.integration.findFirst.mockResolvedValue(null);

    await expect(
      service.handleCallback({ code: 'single-use-code', state: 's'.repeat(43) }),
    ).resolves.toBe(
      'https://company.example.com/integracoes?aiqfome=error&reason=INVALID_OR_EXPIRED_STATE',
    );
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it('ativa a importacao com modalidade valida e prazo proprio da empresa', async () => {
    const { service, prisma, webhookService } = createSubject();
    const serviceTypeId = '55555555-5555-4555-8555-555555555555';
    const activeWebhook = {
      status: 'ACTIVE' as const,
      secretDigest: 'a'.repeat(64),
      registrations: [{ id: 'webhook-1', event: 'new-order' as const }],
      updatedAt: '2026-08-28T14:00:00.000Z',
    };
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({ companyId, role: 'OWNER' });
    prisma.integration.findUnique.mockResolvedValue({
      id: integrationId,
      status: 'CONNECTED',
      credential: { id: 'credential-1' },
      company: { regionId: 'region-1' },
      connectedAt: new Date('2026-08-28T13:00:00.000Z'),
      lastSyncAt: new Date('2026-08-28T13:00:00.000Z'),
      config: {
        version: 2,
        dispatchTrigger: 'NEW_ORDER_DELAYED',
        acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
        store: { id: '54044', name: 'Loja', status: 'OPEN', document: '123', address: null },
        scopes: [],
        serviceTypeId: null,
        dispatchDelayMinutes: null,
        webhook: {
          status: 'INACTIVE',
          secretDigest: null,
          registrations: [],
          updatedAt: null,
        },
        errorCode: null,
      },
    });
    webhookService.activate.mockResolvedValue(activeWebhook);

    await service.updateSettings(user, {
      serviceTypeId,
      dispatchDelayMinutes: 18,
    });

    expect(prisma.serviceType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: serviceTypeId, active: true } }),
    );
    expect(webhookService.activate).toHaveBeenCalledWith(
      integrationId,
      expect.objectContaining({ serviceTypeId, dispatchDelayMinutes: 18 }),
    );
    expect(prisma.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: integrationId },
        data: expect.objectContaining({
          config: expect.objectContaining({ webhook: activeWebhook }),
        }),
      }),
    );
  });

  it('nao reconecta se a tentativa for invalidada durante a persistencia', async () => {
    const { service, transactionClient, prisma } = createSubject();
    prisma.companyTeamMember.findFirst.mockReset().mockResolvedValue({
      companyId,
      company: { document: '12.345.678/0001-90' },
    });
    transactionClient.integration.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.handleCallback({ code: 'single-use-code', state: 's'.repeat(43) }),
    ).resolves.toBe(
      'https://company.example.com/integracoes?aiqfome=error&reason=INVALID_OR_EXPIRED_STATE',
    );
    expect(transactionClient.integrationCredential.upsert).toHaveBeenCalled();
  });
});
