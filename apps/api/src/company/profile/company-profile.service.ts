import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CompanyProfile, OwnPasswordChangeResult } from '@motoboycity/types';
import type {
  ChangeOwnPasswordPayload,
  UpdateCompanyProfilePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async get(user: User): Promise<CompanyProfile> {
    this.assertCompanyUser(user);

    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: {
        role: true,
        company: {
          select: { id: true, tradeName: true, legalName: true, document: true },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa ativa.');
    }

    return {
      companyId: membership.company.id,
      tradeName: membership.company.tradeName,
      legalName: membership.company.legalName,
      document: membership.company.document,
      fullName: user.name,
      email: user.email,
      whatsapp: user.phone,
      canEdit: membership.role === 'OWNER',
    };
  }

  async update(user: User, payload: UpdateCompanyProfilePayload): Promise<CompanyProfile> {
    this.assertCompanyUser(user);

    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.companyTeamMember.findFirst({
        where: { userId: user.id, active: true, role: 'OWNER' },
        select: { companyId: true },
      });

      if (!membership) {
        throw new ForbiddenException(
          'Somente um responsável ativo pode alterar os dados da empresa.',
        );
      }

      const company = await tx.company.update({
        where: { id: membership.companyId },
        data: { tradeName: payload.tradeName, legalName: payload.legalName },
        select: { id: true, tradeName: true, legalName: true, document: true },
      });
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { name: payload.fullName, phone: payload.whatsapp },
        select: { name: true, email: true, phone: true },
      });

      return {
        companyId: company.id,
        tradeName: company.tradeName,
        legalName: company.legalName,
        document: company.document,
        fullName: updatedUser.name,
        email: updatedUser.email,
        whatsapp: updatedUser.phone,
        canEdit: true,
      };
    });
  }

  async changePassword(
    user: User,
    payload: ChangeOwnPasswordPayload,
  ): Promise<OwnPasswordChangeResult> {
    this.assertCompanyUser(user);
    const result = await this.authService.changeOwnPassword(
      user.id,
      payload.currentPassword,
      payload.newPassword,
    );
    this.realtimeGateway.disconnectUser(user.id);
    return result;
  }

  private assertCompanyUser(user: User): void {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
  }
}
