import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PageProtectionService, normalizeSecretAnswer } from './page-protection.service';
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
    companyPageProtectionRecovery: { findUnique: jest.Mock; upsert: jest.Mock };
    user: { findUnique: jest.Mock };
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
      companyPageProtectionRecovery: { findUnique: jest.fn(), upsert: jest.fn() },
      user: { findUnique: jest.fn() },
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

  describe('desativar e trocar a senha pedem a senha atual', () => {
    let protecaoAtiva: {
      id: string;
      companyId: string;
      routeKey: string;
      passwordHash: string;
      enabled: boolean;
      version: number;
    };

    beforeEach(async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1', role: 'OWNER' });
      protecaoAtiva = {
        id: 'prot-1',
        companyId: 'comp-1',
        routeKey: 'FINANCEIRO',
        passwordHash: await bcrypt.hash('senha-certa', 4),
        enabled: true,
        version: 2,
      };
      prisma.companyPageProtection.findUnique.mockResolvedValue(protecaoAtiva);
      prisma.companyPageProtection.update.mockImplementation(async ({ data }) => ({
        ...protecaoAtiva,
        enabled: data.enabled ?? true,
        updatedAt: new Date('2026-10-05T10:00:00Z'),
      }));
    });

    it('não desativa sem a senha atual', async () => {
      await expect(
        service.updateProtection(companyUser, 'FINANCEIRO', { enabled: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.companyPageProtection.update).not.toHaveBeenCalled();
    });

    it('não desativa nem troca com a senha atual errada', async () => {
      await expect(
        service.updateProtection(companyUser, 'FINANCEIRO', {
          enabled: false,
          currentPassword: 'chute',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.updateProtection(companyUser, 'FINANCEIRO', {
          password: 'nova-senha',
          currentPassword: 'chute',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.companyPageProtection.update).not.toHaveBeenCalled();
    });

    it('desativa com a senha certa, só se ela ainda for a gravada', async () => {
      const result = await service.updateProtection(companyUser, 'FINANCEIRO', {
        enabled: false,
        currentPassword: 'senha-certa',
      });

      expect(result.enabled).toBe(false);
      expect(prisma.companyPageProtection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prot-1', passwordHash: protecaoAtiva.passwordHash },
          data: { enabled: false },
        }),
      );
    });

    it('troca feita por outra sessão no meio vira conflito, não sucesso', async () => {
      prisma.companyPageProtection.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.updateProtection(companyUser, 'FINANCEIRO', {
          password: 'nova-senha',
          currentPassword: 'senha-certa',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('proteção desligada reativa e troca a senha sem pedir a antiga', async () => {
      protecaoAtiva.enabled = false;

      await service.updateProtection(companyUser, 'FINANCEIRO', { enabled: true });
      await service.updateProtection(companyUser, 'FINANCEIRO', {
        password: 'nova-senha',
        enabled: true,
      });

      expect(prisma.companyPageProtection.update).toHaveBeenCalledTimes(2);
    });

    it('não cria proteção por cima de uma ativa, que trocaria a senha sem a atual', async () => {
      await expect(
        service.setProtection(companyUser, { routeKey: 'FINANCEIRO', password: 'outra-senha' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.companyPageProtection.upsert).not.toHaveBeenCalled();
    });
  });

  describe('redefinir a senha esquecida', () => {
    beforeEach(async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1', role: 'OWNER' });
      prisma.companyPageProtection.findUnique.mockResolvedValue({ id: 'prot-1' });
      prisma.companyPageProtection.update.mockImplementation(async ({ data }) => ({
        id: 'prot-1',
        enabled: data.enabled,
        updatedAt: new Date('2026-10-05T10:00:00Z'),
      }));
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('senha-do-login', 4),
      });
      prisma.companyPageProtectionRecovery.findUnique.mockResolvedValue({
        answerHash: await bcrypt.hash(normalizeSecretAnswer('Rex'), 4),
      });
    });

    it('pela senha de login: grava a nova senha, reativa e derruba as autorizações antigas', async () => {
      const result = await service.resetPassword(companyUser, 'FINANCEIRO', {
        method: 'ACCOUNT_PASSWORD',
        accountPassword: 'senha-do-login',
        newPassword: 'senha-nova',
      });

      expect(result.enabled).toBe(true);
      const { data } = prisma.companyPageProtection.update.mock.calls[0][0];
      expect(data.enabled).toBe(true);
      expect(data.version).toEqual({ increment: 1 });
      expect(await bcrypt.compare('senha-nova', data.passwordHash)).toBe(true);
    });

    it('senha de login errada não redefine', async () => {
      await expect(
        service.resetPassword(companyUser, 'FINANCEIRO', {
          method: 'ACCOUNT_PASSWORD',
          accountPassword: 'chute',
          newPassword: 'senha-nova',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.companyPageProtection.update).not.toHaveBeenCalled();
    });

    it('pela pergunta secreta, sem ligar para acento, maiúscula ou espaço', async () => {
      await service.resetPassword(companyUser, 'FINANCEIRO', {
        method: 'SECRET_ANSWER',
        secretAnswer: '  RÉX ',
        newPassword: 'senha-nova',
      });

      expect(prisma.companyPageProtection.update).toHaveBeenCalled();
    });

    it('resposta errada não redefine', async () => {
      await expect(
        service.resetPassword(companyUser, 'FINANCEIRO', {
          method: 'SECRET_ANSWER',
          secretAnswer: 'Totó',
          newPassword: 'senha-nova',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.companyPageProtection.update).not.toHaveBeenCalled();
    });

    it('sem pergunta cadastrada, o caminho da resposta não existe', async () => {
      prisma.companyPageProtectionRecovery.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(companyUser, 'FINANCEIRO', {
          method: 'SECRET_ANSWER',
          secretAnswer: 'Rex',
          newPassword: 'senha-nova',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('página sem senha não tem o que redefinir', async () => {
      prisma.companyPageProtection.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(companyUser, 'FINANCEIRO', {
          method: 'ACCOUNT_PASSWORD',
          accountPassword: 'senha-do-login',
          newPassword: 'senha-nova',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('operador não redefine, nem com a própria senha de login certa', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({
        companyId: 'comp-1',
        role: 'OPERATOR',
      });

      await expect(
        service.resetPassword(companyUser, 'FINANCEIRO', {
          method: 'ACCOUNT_PASSWORD',
          accountPassword: 'senha-do-login',
          newPassword: 'senha-nova',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.companyPageProtection.update).not.toHaveBeenCalled();
    });
  });

  describe('pergunta secreta', () => {
    beforeEach(async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ companyId: 'comp-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: await bcrypt.hash('senha-do-login', 4),
      });
      prisma.companyPageProtectionRecovery.upsert.mockImplementation(async ({ create }) => ({
        ...create,
        updatedAt: new Date('2026-10-05T10:00:00Z'),
      }));
    });

    it('cadastrar exige a senha de login do dono', async () => {
      await expect(
        service.setRecovery(companyUser, {
          accountPassword: 'chute',
          question: 'Nome do primeiro cachorro?',
          answer: 'Rex',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.companyPageProtectionRecovery.upsert).not.toHaveBeenCalled();
    });

    it('operador não cadastra a pergunta', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({
        companyId: 'comp-1',
        role: 'OPERATOR',
      });

      await expect(
        service.setRecovery(companyUser, {
          accountPassword: 'senha-do-login',
          question: 'Nome do primeiro cachorro?',
          answer: 'Rex',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('guarda a pergunta e só o hash da resposta normalizada', async () => {
      const status = await service.setRecovery(companyUser, {
        accountPassword: 'senha-do-login',
        question: '  Nome do primeiro cachorro?  ',
        answer: 'Rêx',
      });

      const { create } = prisma.companyPageProtectionRecovery.upsert.mock.calls[0][0];
      expect(create.question).toBe('Nome do primeiro cachorro?');
      expect(create.answerHash).not.toContain('Rêx');
      expect(await bcrypt.compare('rex', create.answerHash)).toBe(true);
      expect(status).toEqual({
        configured: true,
        question: 'Nome do primeiro cachorro?',
        updatedAt: '2026-10-05T10:00:00.000Z',
      });
    });

    it('a consulta mostra a pergunta e nunca a resposta', async () => {
      prisma.companyPageProtectionRecovery.findUnique.mockResolvedValue({
        question: 'Nome do primeiro cachorro?',
        answerHash: 'hash-que-nao-pode-sair',
        updatedAt: new Date('2026-10-05T10:00:00Z'),
      });

      const status = await service.getRecovery(companyUser);

      expect(JSON.stringify(status)).not.toContain('hash-que-nao-pode-sair');
      expect(status.question).toBe('Nome do primeiro cachorro?');
    });

    it('normaliza a resposta: acento, maiúscula e espaços não contam', () => {
      expect(normalizeSecretAnswer('  São   PAULO ')).toBe('sao paulo');
    });
  });
});
