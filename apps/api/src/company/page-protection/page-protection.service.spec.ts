import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PageProtectionService } from './page-protection.service';
import { PAGE_UNLOCK_TOKEN_TYPE } from './page-protection.constants';

const companyUser = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;
const driverUser = { id: 'user-2', type: 'DRIVER' } as User;

describe('PageProtectionService', () => {
  let service: PageProtectionService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    companyPageProtection: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      companyTeamMember: { findFirst: jest.fn() },
      companyPageProtection: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageProtectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(PageProtectionService);
  });

  describe('resolveCompanyId', () => {
    it('rejeita usuario que nao seja membro de empresa', async () => {
      await expect(service.resolveCompanyId(driverUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejeita usuario de empresa sem vinculo ativo', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue(null);
      await expect(service.resolveCompanyId(companyUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('retorna companyId quando vinculo esta ativo', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1' });
      const id = await service.resolveCompanyId(companyUser);
      expect(id).toBe('comp-1');
    });
  });

  describe('list', () => {
    it('retorna o catalogo com status de cada pagina', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1' });
      prisma.companyPageProtection.findMany.mockResolvedValue([
        {
          id: 'prot-1',
          companyId: 'comp-1',
          routeKey: 'FINANCEIRO',
          passwordHash: 'secret-hash',
          enabled: true,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date('2026-09-24T10:00:00Z'),
        },
      ]);

      const list = await service.list(companyUser);
      expect(list.length).toBeGreaterThan(0);

      const financeiro = list.find((p) => p.routeKey === 'FINANCEIRO');
      expect(financeiro).toBeDefined();
      expect(financeiro?.enabled).toBe(true);
      expect(financeiro?.hasProtection).toBe(true);
      // Garante que o hash NUNCA e retornado
      expect('passwordHash' in (financeiro ?? {})).toBe(false);

      const relatorios = list.find((p) => p.routeKey === 'RELATORIOS');
      expect(relatorios?.enabled).toBe(false);
      expect(relatorios?.hasProtection).toBe(false);
    });
  });

  describe('setProtection', () => {
    it('cria protecao com hash seguro e versao inicial', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1' });
      prisma.companyPageProtection.upsert.mockResolvedValue({
        id: 'prot-1',
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        enabled: true,
        version: 1,
        updatedAt: new Date('2026-09-24T10:00:00Z'),
      });

      const result = await service.setProtection(companyUser, {
        routeKey: 'FINANCEIRO',
        password: 'mypassword123',
      });

      expect(prisma.companyPageProtection.upsert).toHaveBeenCalled();
      const upsertArgs = prisma.companyPageProtection.upsert.mock.calls[0][0];
      expect(upsertArgs.create.passwordHash).not.toBe('mypassword123');
      expect(await bcrypt.compare('mypassword123', upsertArgs.create.passwordHash)).toBe(true);
      expect(result.enabled).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('lanca UnauthorizedException quando a senha esta incorreta', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1' });
      const hash = await bcrypt.hash('correct-password', 10);
      prisma.companyPageProtection.findUnique.mockResolvedValue({
        id: 'prot-1',
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        passwordHash: hash,
        enabled: true,
        version: 1,
      });

      await expect(
        service.verifyPassword(companyUser, {
          routeKey: 'FINANCEIRO',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('emite token de autorizacao temporario assinado quando a senha esta correta', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1' });
      const hash = await bcrypt.hash('correct-password', 10);
      prisma.companyPageProtection.findUnique.mockResolvedValue({
        id: 'prot-1',
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        passwordHash: hash,
        enabled: true,
        version: 2,
      });
      jwtService.signAsync.mockResolvedValue('signed-unlock-jwt');

      const result = await service.verifyPassword(companyUser, {
        routeKey: 'FINANCEIRO',
        password: 'correct-password',
      });

      expect(result.success).toBe(true);
      expect(result.unlockToken).toBe('signed-unlock-jwt');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          companyId: 'comp-1',
          routeKey: 'FINANCEIRO',
          version: 2,
          type: PAGE_UNLOCK_TOKEN_TYPE,
        }),
        expect.objectContaining({ expiresIn: '1800s' }),
      );
    });
  });

  describe('isUnlocked', () => {
    it('retorna true quando nao ha protecao configurada ou habilitada', async () => {
      prisma.companyPageProtection.findUnique.mockResolvedValue(null);
      const unlocked = await service.isUnlocked('comp-1', 'FINANCEIRO', undefined);
      expect(unlocked).toBe(true);
    });

    it('retorna false quando protecao esta ativa mas token nao foi informado', async () => {
      prisma.companyPageProtection.findUnique.mockResolvedValue({
        enabled: true,
        version: 1,
      });
      const unlocked = await service.isUnlocked('comp-1', 'FINANCEIRO', undefined);
      expect(unlocked).toBe(false);
    });

    it('retorna false quando a versao do token e antiga (senha foi trocada)', async () => {
      prisma.companyPageProtection.findUnique.mockResolvedValue({
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        enabled: true,
        version: 3, // versao atual
      });
      jwtService.verifyAsync.mockResolvedValue({
        type: PAGE_UNLOCK_TOKEN_TYPE,
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        version: 2, // versao antiga
      });

      const unlocked = await service.isUnlocked('comp-1', 'FINANCEIRO', 'token-antigo');
      expect(unlocked).toBe(false);
    });

    it('retorna true quando o token e valido e coincide com a versao e empresa', async () => {
      prisma.companyPageProtection.findUnique.mockResolvedValue({
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        enabled: true,
        version: 3,
      });
      jwtService.verifyAsync.mockResolvedValue({
        type: PAGE_UNLOCK_TOKEN_TYPE,
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        version: 3,
      });

      const unlocked = await service.isUnlocked('comp-1', 'FINANCEIRO', 'valid-token');
      expect(unlocked).toBe(true);
    });
  });
});
