import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  PageProtectionRecoveryStatus,
  PageProtectionStatusItem,
  ProtectablePageRoute,
  ResetPageProtectionPayload,
  SetPageProtectionPayload,
  SetPageProtectionRecoveryPayload,
  UpdatePageProtectionPayload,
  VerifyPagePasswordPayload,
  VerifyPagePasswordResult,
  PageUnlockTokenPayload,
} from '@motoboycity/types';
import { Prisma, type CompanyPageProtectionRecovery, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PAGE_UNLOCK_EXPIRATION_SECONDS,
  PAGE_UNLOCK_TOKEN_TYPE,
  PASSWORD_HASH_ROUNDS,
  PROTECTABLE_PAGE_CATALOG,
} from './page-protection.constants';

/**
 * A resposta da pergunta secreta como ela é comparada: sem acento, sem
 * maiúscula e sem espaço sobrando. "  Rex " e "rex" são a mesma resposta — o
 * dono não pode ficar de fora por ter digitado diferente do cadastro.
 */
export function normalizeSecretAnswer(answer: string): string {
  return answer.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

@Injectable()
export class PageProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async resolveCompanyId(user: User): Promise<string> {
    return (await this.resolveMembership(user)).companyId;
  }

  private async resolveMembership(user: User) {
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

  /**
   * Redefinir senha e cadastrar a pergunta secreta são do dono. Um operador
   * com login próprio não pode usar a própria senha para abrir o que o dono
   * fechou.
   */
  private async resolveOwnerCompanyId(user: User): Promise<string> {
    const membership = await this.resolveMembership(user);
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException('Só o responsável principal da empresa pode fazer isso.');
    }
    return membership.companyId;
  }

  /** Confere a senha de login do painel, sem gravar nada. */
  private async assertAccountPassword(userId: string, accountPassword: string): Promise<void> {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!account || !(await bcrypt.compare(accountPassword, account.passwordHash))) {
      throw new ForbiddenException('Senha de login incorreta.');
    }
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

    // Criar por cima de uma proteção ativa trocaria a senha sem pedir a atual.
    const existing = await this.prisma.companyPageProtection.findUnique({
      where: {
        company_page_protection_unique: {
          companyId,
          routeKey: payload.routeKey,
        },
      },
      select: { enabled: true },
    });
    if (existing?.enabled) {
      throw new ConflictException(
        'Esta página já está protegida. Para trocar a senha, use "Alterar senha".',
      );
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

    // Com a proteção ativa, desativar ou trocar a senha pede a senha atual.
    // Desligada, a página já está aberta: trocar a senha ou reativar não
    // abre nada que estivesse fechado.
    const exigeSenhaAtual =
      existing.enabled && (payload.enabled === false || payload.password !== undefined);
    if (exigeSenhaAtual) {
      if (!payload.currentPassword) {
        throw new BadRequestException('Informe a senha atual da página.');
      }
      if (!(await bcrypt.compare(payload.currentPassword, existing.passwordHash))) {
        throw new ForbiddenException('Senha atual da página incorreta.');
      }
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

    let updated;
    try {
      updated = await this.prisma.companyPageProtection.update({
        // A senha conferida acima tem de ser a que ainda está gravada: se outra
        // sessão trocou no meio, este pedido não vale.
        where: exigeSenhaAtual
          ? { id: existing.id, passwordHash: existing.passwordHash }
          : { id: existing.id },
        data: dataToUpdate,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException(
          'A senha desta página foi alterada em outra sessão. Atualize a tela e tente de novo.',
        );
      }
      throw error;
    }

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

  /**
   * Senha da página esquecida: o dono cria outra provando quem é pela senha de
   * login do painel ou pela resposta da pergunta secreta. A proteção volta
   * ativa, e a versão nova derruba toda autorização aberta com a senha antiga.
   */
  async resetPassword(
    user: User,
    routeKey: ProtectablePageRoute,
    payload: ResetPageProtectionPayload,
  ): Promise<PageProtectionStatusItem> {
    const companyId = await this.resolveOwnerCompanyId(user);
    const catalogItem = PROTECTABLE_PAGE_CATALOG.find((c) => c.routeKey === routeKey);
    if (!catalogItem) {
      throw new BadRequestException('Página inválida para proteção.');
    }

    const existing = await this.prisma.companyPageProtection.findUnique({
      where: { company_page_protection_unique: { companyId, routeKey } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(
        'Esta página ainda não tem senha. Use "Proteger" para criar uma.',
      );
    }

    if (payload.method === 'ACCOUNT_PASSWORD') {
      await this.assertAccountPassword(user.id, payload.accountPassword);
    } else {
      const recovery = await this.prisma.companyPageProtectionRecovery.findUnique({
        where: { companyId },
        select: { answerHash: true },
      });
      if (!recovery) {
        throw new BadRequestException('A empresa ainda não cadastrou uma pergunta secreta.');
      }
      const matches = await bcrypt.compare(
        normalizeSecretAnswer(payload.secretAnswer),
        recovery.answerHash,
      );
      if (!matches) {
        throw new ForbiddenException('Resposta incorreta.');
      }
    }

    const updated = await this.prisma.companyPageProtection.update({
      where: { id: existing.id },
      data: {
        passwordHash: await bcrypt.hash(payload.newPassword, PASSWORD_HASH_ROUNDS),
        enabled: true,
        version: { increment: 1 },
      },
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

  /** Qualquer membro vê a pergunta (ela aparece na redefinição); a resposta nunca sai. */
  async getRecovery(user: User): Promise<PageProtectionRecoveryStatus> {
    const companyId = await this.resolveCompanyId(user);
    const recovery = await this.prisma.companyPageProtectionRecovery.findUnique({
      where: { companyId },
    });
    return recoveryStatus(recovery);
  }

  /**
   * Cadastro ou troca da pergunta secreta. Pede a senha de login do dono: sem
   * isso, quem tem o painel aberto trocaria a pergunta e, com a resposta que
   * ele mesmo escolheu, redefiniria qualquer senha de página.
   */
  async setRecovery(
    user: User,
    payload: SetPageProtectionRecoveryPayload,
  ): Promise<PageProtectionRecoveryStatus> {
    const companyId = await this.resolveOwnerCompanyId(user);
    await this.assertAccountPassword(user.id, payload.accountPassword);

    const answerHash = await bcrypt.hash(
      normalizeSecretAnswer(payload.answer),
      PASSWORD_HASH_ROUNDS,
    );
    const question = payload.question.trim();
    const recovery = await this.prisma.companyPageProtectionRecovery.upsert({
      where: { companyId },
      create: { companyId, question, answerHash },
      update: { question, answerHash },
    });
    return recoveryStatus(recovery);
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

function recoveryStatus(
  recovery: CompanyPageProtectionRecovery | null,
): PageProtectionRecoveryStatus {
  return {
    configured: Boolean(recovery),
    question: recovery?.question ?? null,
    updatedAt: recovery?.updatedAt.toISOString() ?? null,
  };
}
