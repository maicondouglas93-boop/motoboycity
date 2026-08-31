import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { credentialFingerprint } from './credential-fingerprint';
import { AuthService } from './auth.service';

const validPayload = {
  name: 'Maria Silva',
  email: 'maria@empresa.com.br',
  phone: '33999887766',
  document: '12345678901',
  legalName: 'Empresa Exemplo LTDA',
  tradeName: 'Empresa Exemplo',
  password: 'senhaSegura123',
};

const validDriverPayload = {
  name: 'João Motoboy',
  email: 'joao@motoboycity.com.br',
  phone: '33999887766',
  cpf: '12345678901',
  birthDate: '1990-05-20',
  pixKey: 'joao@motoboycity.com.br',
  pixKeyType: 'EMAIL' as const,
  hasCnpj: false,
  password: 'senhaSegura123',
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    company: { findUnique: jest.Mock; create: jest.Mock };
    companyTeamMember: { create: jest.Mock; findFirst: jest.Mock };
    driver: { findUnique: jest.Mock; create: jest.Mock };
    driverServiceType: { createMany: jest.Mock };
    serviceType: { findMany: jest.Mock };
    region: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      company: { findUnique: jest.fn(), create: jest.fn() },
      companyTeamMember: { create: jest.fn(), findFirst: jest.fn() },
      driver: { findUnique: jest.fn(), create: jest.fn() },
      driverServiceType: { createMany: jest.fn() },
      serviceType: { findMany: jest.fn() },
      region: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('registerCompany', () => {
    it('cria User, Company e CompanyTeamMember quando os dados são válidos', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
        prisma.user.create.mockResolvedValue({ id: 'user-1' });
        prisma.company.create.mockResolvedValue({
          id: 'company-1',
          status: 'PENDING_APPROVAL',
        });
        prisma.companyTeamMember.create.mockResolvedValue({ id: 'member-1' });
        return callback(prisma);
      });

      const result = await service.registerCompany(validPayload);

      expect(result).toEqual({ companyId: 'company-1', status: 'PENDING_APPROVAL' });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'COMPANY_MEMBER', email: validPayload.email }),
        }),
      );
      expect(prisma.companyTeamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'OWNER',
            userId: 'user-1',
            companyId: 'company-1',
          }),
        }),
      );
    });

    it('rejeita quando o e-mail já está cadastrado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.registerCompany(validPayload)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
    });

    it('cadastro administrativo usa somente a região ativa escolhida', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue({ id: 'region-2' });
      prisma.user.create.mockResolvedValue({ id: 'user-2' });
      prisma.company.create.mockResolvedValue({
        id: 'company-2',
        status: 'PENDING_APPROVAL',
      });

      await service.registerCompany(validPayload, { regionId: 'region-2' });

      expect(prisma.region.findFirst).toHaveBeenCalledWith({
        where: { id: 'region-2', active: true },
      });
      expect(prisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ regionId: 'region-2' }) }),
      );
    });

    it('rejeita quando o CPF/CNPJ já está cadastrado', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue({ id: 'existing-company' });

      await expect(service.registerCompany(validPayload)).rejects.toBeInstanceOf(ConflictException);
    });

    it('lança erro quando não há nenhuma região configurada', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue(null);

      await expect(service.registerCompany(validPayload)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('registerDriver', () => {
    it('cria User e Driver quando os dados são válidos', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
        prisma.user.create.mockResolvedValue({ id: 'user-1' });
        prisma.driver.create.mockResolvedValue({
          id: 'driver-1',
          approvalStatus: 'PENDING',
        });
        return callback(prisma);
      });

      const result = await service.registerDriver(validDriverPayload);

      expect(result).toEqual({ driverId: 'driver-1', approvalStatus: 'PENDING' });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'DRIVER', email: validDriverPayload.email }),
        }),
      );
      expect(prisma.driver.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            cpf: validDriverPayload.cpf,
            pixKey: validDriverPayload.pixKey,
            pixKeyType: validDriverPayload.pixKeyType,
            hasCnpj: validDriverPayload.hasCnpj,
            regionId: 'region-1',
          }),
        }),
      );
    });

    it('cadastro administrativo usa a região escolhida e cria modalidades na mesma transação', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue({ id: 'region-2' });
      prisma.serviceType.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }]);
      prisma.user.create.mockResolvedValue({ id: 'user-admin-created' });
      prisma.driver.create.mockResolvedValue({
        id: 'driver-admin-created',
        approvalStatus: 'PENDING',
      });

      const result = await service.registerDriver(validDriverPayload, {
        regionId: 'region-2',
        serviceTypeIds: ['service-2', 'service-1'],
      });

      expect(result).toEqual({
        driverId: 'driver-admin-created',
        approvalStatus: 'PENDING',
      });
      expect(prisma.region.findFirst).toHaveBeenCalledWith({
        where: { id: 'region-2', active: true },
      });
      expect(prisma.driverServiceType.createMany).toHaveBeenCalledWith({
        data: [
          { driverId: 'driver-admin-created', serviceTypeId: 'service-2', isPrimary: true },
          { driverId: 'driver-admin-created', serviceTypeId: 'service-1', isPrimary: false },
        ],
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      const passwordHash = prisma.user.create.mock.calls[0]?.[0]?.data.passwordHash;
      expect(passwordHash).not.toBe(validDriverPayload.password);
      await expect(bcrypt.compare(validDriverPayload.password, passwordHash)).resolves.toBe(true);
    });

    it('não cria conta quando uma modalidade administrativa está inativa', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue({ id: 'region-2' });
      prisma.serviceType.findMany.mockResolvedValue([{ id: 'service-1' }]);

      await expect(
        service.registerDriver(validDriverPayload, {
          regionId: 'region-2',
          serviceTypeIds: ['service-1', 'service-inactive'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.driver.create).not.toHaveBeenCalled();
    });

    it('traduz colisão concorrente de e-mail ou CPF para conflito', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(service.registerDriver(validDriverPayload)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejeita quando o e-mail já está cadastrado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.registerDriver(validDriverPayload)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.driver.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita quando o CPF já está cadastrado', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue({ id: 'existing-driver' });

      await expect(service.registerDriver(validDriverPayload)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lança erro quando não há nenhuma região configurada', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.region.findFirst.mockResolvedValue(null);

      await expect(service.registerDriver(validDriverPayload)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('replacePassword', () => {
    it('salva apenas o hash bcrypt e nunca devolve a credencial', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1' });

      await expect(service.replacePassword('user-1', 'senhaNova123')).resolves.toEqual({
        userId: 'user-1',
      });

      const update = prisma.user.update.mock.calls[0]?.[0];
      expect(update.where).toEqual({ id: 'user-1' });
      expect(update.select).toEqual({ id: true });
      expect(update.data.passwordHash).not.toBe('senhaNova123');
      await expect(bcrypt.compare('senhaNova123', update.data.passwordHash)).resolves.toBe(true);
    });

    it('executa mutações relacionadas na mesma transação da credencial', async () => {
      prisma.user.update.mockResolvedValue({ id: 'user-1' });
      const mutateInSameTransaction = jest.fn().mockResolvedValue(undefined);

      await expect(
        service.replacePassword('user-1', 'senhaNova123', { mutateInSameTransaction }),
      ).resolves.toEqual({ userId: 'user-1' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mutateInSameTransaction).toHaveBeenCalledWith(prisma);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' }, select: { id: true } }),
      );
    });
  });

  describe('changeOwnPassword', () => {
    it('confere a senha atual e troca o hash com guarda contra concorrencia', async () => {
      const currentPasswordHash = await bcrypt.hash('senhaAtual123', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: currentPasswordHash,
      });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.changeOwnPassword('user-1', 'senhaAtual123', 'senhaNova123'),
      ).resolves.toEqual({ changed: true });

      const update = prisma.user.updateMany.mock.calls[0]?.[0];
      expect(update.where).toEqual({ id: 'user-1', passwordHash: currentPasswordHash });
      expect(update.data.passwordHash).not.toBe('senhaNova123');
      await expect(bcrypt.compare('senhaNova123', update.data.passwordHash)).resolves.toBe(true);
    });

    it('recusa quando a senha atual esta incorreta sem gravar outro hash', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senhaAtual123', 4),
      });

      await expect(
        service.changeOwnPassword('user-1', 'senhaErrada123', 'senhaNova123'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('recusa reutilizar a senha atual', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senhaAtual123', 4),
      });

      await expect(
        service.changeOwnPassword('user-1', 'senhaAtual123', 'senhaAtual123'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('recusa quando a credencial mudou entre a conferencia e a gravacao', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: await bcrypt.hash('senhaAtual123', 4),
      });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeOwnPassword('user-1', 'senhaAtual123', 'senhaNova123'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const loginPayload = { email: 'maria@empresa.com.br', password: 'senhaSegura123' };

    it('retorna accessToken e dados do usuário quando as credenciais são válidas', async () => {
      const passwordHash = await bcrypt.hash(loginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria Silva',
        email: loginPayload.email,
        type: 'COMPANY_MEMBER',
        passwordHash,
      });
      prisma.companyTeamMember.findFirst.mockResolvedValue({
        company: { id: 'company-1', status: 'PENDING_APPROVAL' },
      });

      const result = await service.login(loginPayload);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'Maria Silva',
        email: loginPayload.email,
        type: 'COMPANY_MEMBER',
        avatarUrl: null,
      });
      expect(result.company).toEqual({ id: 'company-1', status: 'PENDING_APPROVAL' });
      expect(prisma.companyTeamMember.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', active: true },
        include: { company: true },
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        credentialVersion: credentialFingerprint(passwordHash),
      });
    });

    it('rejeita login de membro cujo vínculo com a empresa está inativo', async () => {
      const passwordHash = await bcrypt.hash(loginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria Silva',
        email: loginPayload.email,
        type: 'COMPANY_MEMBER',
        passwordHash,
      });
      prisma.companyTeamMember.findFirst.mockResolvedValue(null);

      await expect(service.login(loginPayload)).rejects.toBeInstanceOf(ForbiddenException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejeita quando o e-mail não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginPayload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita quando a senha está incorreta', async () => {
      const passwordHash = await bcrypt.hash('outra-senha', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria Silva',
        email: loginPayload.email,
        type: 'COMPANY_MEMBER',
        passwordHash,
      });

      await expect(service.login(loginPayload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita login de empresa suspensa', async () => {
      const passwordHash = await bcrypt.hash(loginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria Silva',
        email: loginPayload.email,
        type: 'COMPANY_MEMBER',
        passwordHash,
      });
      prisma.companyTeamMember.findFirst.mockResolvedValue({
        company: { id: 'company-1', status: 'SUSPENDED' },
      });

      await expect(service.login(loginPayload)).rejects.toBeInstanceOf(ForbiddenException);
    });

    const driverLoginPayload = { email: 'joao@motoboycity.com.br', password: 'senhaSegura123' };

    it('permite login de motoboy com aprovação PENDING e devolve driver no resultado', async () => {
      const passwordHash = await bcrypt.hash(driverLoginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'João Motoboy',
        email: driverLoginPayload.email,
        type: 'DRIVER',
        passwordHash,
      });
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'PENDING',
        accountStatus: 'ACTIVE',
      });

      const result = await service.login(driverLoginPayload);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.driver).toEqual({ id: 'driver-1', approvalStatus: 'PENDING' });
    });

    it('permite login de motoboy aprovado e ativo', async () => {
      const passwordHash = await bcrypt.hash(driverLoginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'João Motoboy',
        email: driverLoginPayload.email,
        type: 'DRIVER',
        passwordHash,
      });
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });

      const result = await service.login(driverLoginPayload);

      expect(result.driver).toEqual({ id: 'driver-1', approvalStatus: 'APPROVED' });
    });

    it('rejeita login de motoboy com cadastro REJECTED', async () => {
      const passwordHash = await bcrypt.hash(driverLoginPayload.password, 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'João Motoboy',
        email: driverLoginPayload.email,
        type: 'DRIVER',
        passwordHash,
      });
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'REJECTED',
        accountStatus: 'ACTIVE',
      });

      await expect(service.login(driverLoginPayload)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['SUSPENDED', 'BLOCKED'])(
      'rejeita login de motoboy com accountStatus %s',
      async (accountStatus) => {
        const passwordHash = await bcrypt.hash(driverLoginPayload.password, 4);
        prisma.user.findUnique.mockResolvedValue({
          id: 'user-1',
          name: 'João Motoboy',
          email: driverLoginPayload.email,
          type: 'DRIVER',
          passwordHash,
        });
        prisma.driver.findUnique.mockResolvedValue({
          id: 'driver-1',
          approvalStatus: 'APPROVED',
          accountStatus,
        });

        await expect(service.login(driverLoginPayload)).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });
});
