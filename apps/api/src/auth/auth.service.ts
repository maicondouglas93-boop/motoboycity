import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  LoginPayload,
  RegisterCompanyPayload,
  RegisterDriverPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PASSWORD_HASH_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';

export interface RegisterCompanyResult {
  companyId: string;
  status: string;
}

export interface RegisterDriverResult {
  driverId: string;
  approvalStatus: string;
}

export interface LoginResult {
  accessToken: string;
  user: { id: string; name: string; email: string; type: string };
  company?: { id: string; status: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async registerCompany(payload: RegisterCompanyPayload): Promise<RegisterCompanyResult> {
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

    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new InternalServerErrorException(
        'Nenhuma região configurada na plataforma. Contate o suporte.',
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);

    const company = await this.prisma.$transaction(async (tx) => {
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
    });

    return { companyId: company.id, status: company.status };
  }

  async registerDriver(payload: RegisterDriverPayload): Promise<RegisterDriverResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: payload.email } });
    if (existingUser) {
      throw new ConflictException('Este e-mail já está cadastrado.');
    }

    const existingDriver = await this.prisma.driver.findUnique({ where: { cpf: payload.cpf } });
    if (existingDriver) {
      throw new ConflictException('Este CPF já está cadastrado.');
    }

    const region = await this.prisma.region.findFirst({ where: { active: true } });
    if (!region) {
      throw new InternalServerErrorException(
        'Nenhuma região configurada na plataforma. Contate o suporte.',
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);

    const driver = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          type: 'DRIVER',
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          passwordHash,
        },
      });

      return tx.driver.create({
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
    });

    return { driverId: driver.id, approvalStatus: driver.approvalStatus };
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
    if (company?.status === 'SUSPENDED') {
      throw new ForbiddenException('Sua empresa está suspensa. Entre em contato com o suporte.');
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id });

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, type: user.type },
      ...(company && { company }),
    };
  }

  private async findCompanyForUser(
    user: User,
  ): Promise<{ id: string; status: string } | undefined> {
    if (user.type !== 'COMPANY_MEMBER') {
      return undefined;
    }

    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id },
      include: { company: true },
    });

    if (!membership) {
      return undefined;
    }

    return { id: membership.company.id, status: membership.company.status };
  }
}
