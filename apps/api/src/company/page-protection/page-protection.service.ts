import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  PageProtectionStatusItem,
  ProtectablePageRoute,
  SetPageProtectionPayload,
  UpdatePageProtectionPayload,
  VerifyPagePasswordPayload,
  VerifyPagePasswordResult,
  PageUnlockTokenPayload,
} from '@motoboycity/types';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PAGE_UNLOCK_EXPIRATION_SECONDS,
  PAGE_UNLOCK_TOKEN_TYPE,
  PASSWORD_HASH_ROUNDS,
  PROTECTABLE_PAGE_CATALOG,
} from './page-protection.constants';

@Injectable()
export class PageProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa ativa.');
    }
    return membership.companyId;
  }

  async list(user: User): Promise<PageProtectionStatusItem[]> {
    const companyId = await this.resolveCompanyId(user);
    const protections = await this.prisma.companyPageProtection.findMany({
      where: { companyId },
    });

    const protectionMap = new Map(protections.map((p) => [p.routeKey, p]));

    return PROTECTABLE_PAGE_CATALOG.map((item) => {
      const p = protectionMap.get(item.routeKey);
      return {
        routeKey: item.routeKey,
        label: item.label,
        path: item.path,
        description: item.description,
        enabled: p?.enabled ?? false,
        hasProtection: Boolean(p),
        updatedAt: p?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  async setProtection(
    user: User,
    payload: SetPageProtectionPayload,
  ): Promise<PageProtectionStatusItem> {
    const companyId = await this.resolveCompanyId(user);
    const catalogItem = PROTECTABLE_PAGE_CATALOG.find((c) => c.routeKey === payload.routeKey);
    if (!catalogItem) {
      throw new BadRequestException('Página inválida para proteção.');
    }

    const passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);

    const protection = await this.prisma.companyPageProtection.upsert({
      where: {
        company_page_protection_unique: {
          companyId,
          routeKey: payload.routeKey,
        },
      },
      create: {
        companyId,
        routeKey: payload.routeKey,
        passwordHash,
        enabled: true,
        version: 1,
      },
      update: {
        passwordHash,
        enabled: true,
        version: { increment: 1 },
      },
    });

    return {
      routeKey: catalogItem.routeKey,
      label: catalogItem.label,
      path: catalogItem.path,
      description: catalogItem.description,
      enabled: protection.enabled,
      hasProtection: true,
      updatedAt: protection.updatedAt.toISOString(),
    };
  }

  async updateProtection(
    user: User,
    routeKey: ProtectablePageRoute,
    payload: UpdatePageProtectionPayload,
  ): Promise<PageProtectionStatusItem> {
    const companyId = await this.resolveCompanyId(user);
    const catalogItem = PROTECTABLE_PAGE_CATALOG.find((c) => c.routeKey === routeKey);
    if (!catalogItem) {
      throw new BadRequestException('Página inválida para proteção.');
    }

    const existing = await this.prisma.companyPageProtection.findUnique({
      where: {
        company_page_protection_unique: {
          companyId,
          routeKey,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Proteção para esta página não encontrada.');
    }

    const dataToUpdate: {
      passwordHash?: string;
      enabled?: boolean;
      version?: { increment: number };
    } = {};

    if (payload.password) {
      dataToUpdate.passwordHash = await bcrypt.hash(payload.password, PASSWORD_HASH_ROUNDS);
      dataToUpdate.version = { increment: 1 };
    }

    if (typeof payload.enabled === 'boolean') {
      dataToUpdate.enabled = payload.enabled;
    }

    const updated = await this.prisma.companyPageProtection.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });

    return {
      routeKey: catalogItem.routeKey,
      label: catalogItem.label,
      path: catalogItem.path,
      description: catalogItem.description,
      enabled: updated.enabled,
      hasProtection: true,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async verifyPassword(
    user: User,
    payload: VerifyPagePasswordPayload,
  ): Promise<VerifyPagePasswordResult> {
    const companyId = await this.resolveCompanyId(user);
    const protection = await this.prisma.companyPageProtection.findUnique({
      where: {
        company_page_protection_unique: {
          companyId,
          routeKey: payload.routeKey,
        },
      },
    });

    if (!protection || !protection.enabled) {
      return {
        success: true,
        unlockToken: '',
        expiresInSeconds: 0,
      };
    }

    const matches = await bcrypt.compare(payload.password, protection.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Senha incorreta.');
    }

    const tokenPayload: PageUnlockTokenPayload = {
      sub: user.id,
      companyId,
      routeKey: payload.routeKey,
      version: protection.version,
      type: PAGE_UNLOCK_TOKEN_TYPE,
    };

    const unlockToken = await this.jwtService.signAsync(tokenPayload, {
      expiresIn: `${PAGE_UNLOCK_EXPIRATION_SECONDS}s`,
    });

    return {
      success: true,
      unlockToken,
      expiresInSeconds: PAGE_UNLOCK_EXPIRATION_SECONDS,
    };
  }

  async isUnlocked(
    companyId: string,
    routeKey: ProtectablePageRoute,
    unlockToken: string | undefined,
  ): Promise<boolean> {
    const protection = await this.prisma.companyPageProtection.findUnique({
      where: {
        company_page_protection_unique: {
          companyId,
          routeKey,
        },
      },
    });

    // Se nao possui protecao ativa, o acesso e livre
    if (!protection || !protection.enabled) {
      return true;
    }

    if (!unlockToken) {
      return false;
    }

    try {
      const decoded = await this.jwtService.verifyAsync<PageUnlockTokenPayload>(unlockToken);
      if (
        decoded.type !== PAGE_UNLOCK_TOKEN_TYPE ||
        decoded.companyId !== companyId ||
        decoded.routeKey !== routeKey ||
        decoded.version !== protection.version
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
