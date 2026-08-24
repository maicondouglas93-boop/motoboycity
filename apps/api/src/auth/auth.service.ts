import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  AdminPasswordChangeResult,
  RegisterCompanyResult as SharedRegisterCompanyResult,
  RegisterDriverResult as SharedRegisterDriverResult,
} from '@motoboycity/types';
import type {
  LoginPayload,
  RegisterCompanyPayload,
  RegisterDriverPayload,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { credentialFingerprint } from './credential-fingerprint';

const PASSWORD_HASH_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';

export type RegisterCompanyResult = SharedRegisterCompanyResult;

export type RegisterDriverResult = SharedRegisterDriverResult;

export interface RegisterDriverOptions {
  regionId?: string;
  serviceTypeIds?: string[];
}

export interface RegisterCompanyOptions {
  regionId?: string;
}

export interface ReplacePasswordOptions {
  mutateInSameTransaction?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export interface LoginResult {
  accessToken: string;
  user: { id: string; name: string; email: string; type: string; avatarUrl: string | null };
  company?: { id: string; status: string };
  driver?: { id: string; approvalStatus: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async registerCompany(
    payload: RegisterCompanyPayload,
    options: RegisterCompanyOptions = {},
  ): Promise<RegisterCompanyResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: payload.email } });
    if (existingUser) {
      throw new ConflictException('Este e-mail já está cadastrado.');
    }

    const existingCompany = await this.prisma.company.findUnique({
      where: { document: payload.document },
    });
    if (existingCompany) {
      throw new ConflictException('Este CPF/CNPJ já está cadastrado.');
    }

    const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const company = await this.prisma.$transaction(
          async (tx) => {
            const region = await tx.region.findFirst({
              where: options.regionId ? { id: options.regionId, active: true } : { active: true },
            });
            if (!region) {
              if (options.regionId) {
                throw new ConflictException('A região selecionada não existe ou está inativa.');
              }
              throw new InternalServerErrorException(
                'Nenhuma região configurada na plataforma. Contate o suporte.',
              );
            }

            const user = await tx.user.create({
              data: {
                type: 'COMPANY_MEMBER',
                name: payload.name,
                email: payload.email,
                phone: payload.phone,
                passwordHash,
              },
            });

            const createdCompany = await tx.company.create({
              data: {
                legalName: payload.legalName,
                tradeName: payload.tradeName,
                document: payload.document,
                regionId: region.id,
              },
            });

            await tx.companyTeamMember.create({
              data: {
                companyId: createdCompany.id,
                userId: user.id,
                role: 'OWNER',
              },
            });

            return createdCompany;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return { companyId: company.id, status: company.status };
      } catch (error) {
        if (this.isPrismaErrorCode(error, 'P2002')) {
          throw new ConflictException('Este e-mail ou CPF/CNPJ já está cadastrado.');
        }
        if (this.isPrismaErrorCode(error, 'P2034')) {
          if (attempt < maxAttempts) continue;
          throw new ConflictException(
            'Outro cadastro ocorreu ao mesmo tempo. Confira os dados e tente novamente.',
          );
        }
        throw error;
      }
    }

    throw new ConflictException('Não foi possível concluir o cadastro da empresa.');
  }

  async replacePassword(
    userId: string,
    password: string,
    options: ReplacePasswordOptions = {},
  ): Promise<AdminPasswordChangeResult> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    try {
      const user = options.mutateInSameTransaction
        ? await this.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
              where: { id: userId },
              data: { passwordHash },
              select: { id: true },
            });
            await options.mutateInSameTransaction!(tx);
            return updated;
          })
        : await this.prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
            select: { id: true },
          });
      return { userId: user.id };
    } catch (error) {
      if (this.isPrismaErrorCode(error, 'P2025')) {
        throw new NotFoundException('Usuário não encontrado.');
      }
      throw error;
    }
  }

  async registerDriver(
    payload: RegisterDriverPayload,
    options: RegisterDriverOptions = {},
  ): Promise<RegisterDriverResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: payload.email } });
    if (existingUser) {
      throw new ConflictException('Este e-mail já está cadastrado.');
    }

    const existingDriver = await this.prisma.driver.findUnique({ where: { cpf: payload.cpf } });
    if (existingDriver) {
      throw new ConflictException('Este CPF já está cadastrado.');
    }

    const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const driver = await this.prisma.$transaction(
          async (tx) => {
            const region = await tx.region.findFirst({
              where: options.regionId ? { id: options.regionId, active: true } : { active: true },
            });
            if (!region) {
              if (options.regionId) {
                throw new ConflictException('A região selecionada não existe ou está inativa.');
              }
              throw new InternalServerErrorException(
                'Nenhuma região configurada na plataforma. Contate o suporte.',
              );
            }

            const serviceTypeIds = options.serviceTypeIds ?? [];
            if (serviceTypeIds.length > 0) {
              const serviceTypes = await tx.serviceType.findMany({
                where: { id: { in: serviceTypeIds }, active: true },
                select: { id: true },
              });
              if (serviceTypes.length !== serviceTypeIds.length) {
                throw new ConflictException(
                  'Todas as modalidades selecionadas devem existir e estar ativas.',
                );
              }
            }

            const user = await tx.user.create({
              data: {
                type: 'DRIVER',
                name: payload.name,
                email: payload.email,
                phone: payload.phone,
                passwordHash,
              },
            });

            const createdDriver = await tx.driver.create({
              data: {
                userId: user.id,
                cpf: payload.cpf,
                birthDate: new Date(payload.birthDate),
                pixKey: payload.pixKey,
                pixKeyType: payload.pixKeyType,
                hasCnpj: payload.hasCnpj,
                regionId: region.id,
              },
            });

            if (serviceTypeIds.length > 0) {
              await tx.driverServiceType.createMany({
                data: serviceTypeIds.map((serviceTypeId, index) => ({
                  driverId: createdDriver.id,
                  serviceTypeId,
                  isPrimary: index === 0,
                })),
              });
            }

            return createdDriver;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return { driverId: driver.id, approvalStatus: driver.approvalStatus };
      } catch (error) {
        if (this.isPrismaErrorCode(error, 'P2002')) {
          throw new ConflictException('Este e-mail ou CPF já está cadastrado.');
        }
        if (this.isPrismaErrorCode(error, 'P2034')) {
          if (attempt < maxAttempts) continue;
          throw new ConflictException(
            'Outro cadastro ocorreu ao mesmo tempo. Confira os dados e tente novamente.',
          );
        }
        throw error;
      }
    }

    throw new ConflictException('Não foi possível concluir o cadastro do entregador.');
  }

  async login(payload: LoginPayload): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const company = await this.findCompanyForUser(user);
    if (user.type === 'COMPANY_MEMBER' && !company) {
      throw new ForbiddenException(
        'Seu acesso à empresa não está ativo. Entre em contato com o suporte.',
      );
    }
    if (company?.status === 'SUSPENDED') {
      throw new ForbiddenException('Sua empresa está suspensa. Entre em contato com o suporte.');
    }

    const driver = await this.findDriverForUser(user);
    if (driver?.approvalStatus === 'REJECTED') {
      throw new ForbiddenException(
        'Seu cadastro de entregador foi rejeitado. Entre em contato com o suporte.',
      );
    }
    if (driver?.accountStatus === 'SUSPENDED' || driver?.accountStatus === 'BLOCKED') {
      throw new ForbiddenException(
        'Sua conta de entregador está suspensa. Entre em contato com o suporte.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      credentialVersion: credentialFingerprint(user.passwordHash),
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type,
        avatarUrl: user.avatarUrl ?? null,
      },
      ...(company && { company }),
      ...(driver && { driver: { id: driver.id, approvalStatus: driver.approvalStatus } }),
    };
  }

  private async findCompanyForUser(
    user: User,
  ): Promise<{ id: string; status: string } | undefined> {
    if (user.type !== 'COMPANY_MEMBER') {
      return undefined;
    }

    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      include: { company: true },
    });

    if (!membership) {
      return undefined;
    }

    return { id: membership.company.id, status: membership.company.status };
  }

  private async findDriverForUser(
    user: User,
  ): Promise<{ id: string; approvalStatus: string; accountStatus: string } | undefined> {
    if (user.type !== 'DRIVER') {
      return undefined;
    }

    const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver) {
      return undefined;
    }

    return {
      id: driver.id,
      approvalStatus: driver.approvalStatus,
      accountStatus: driver.accountStatus,
    };
  }

  private isPrismaErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
