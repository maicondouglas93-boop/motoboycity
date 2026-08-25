import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { credentialFingerprint } from './credential-fingerprint';

export interface JwtPayload {
  sub: string;
  credentialVersion?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }
    if (payload.credentialVersion !== credentialFingerprint(user.passwordHash)) {
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    }
    if (user.type === 'COMPANY_MEMBER') {
      const activeMembership = await this.prisma.companyTeamMember.findFirst({
        where: { userId: user.id, active: true },
        select: { id: true, company: { select: { status: true } } },
      });
      if (!activeMembership) {
        throw new UnauthorizedException(
          'Seu acesso à empresa não está ativo. Entre em contato com o suporte.',
        );
      }
      if (activeMembership.company.status === 'SUSPENDED') {
        throw new UnauthorizedException(
          'Sua empresa esta suspensa. Entre em contato com o suporte.',
        );
      }
    }
    return user;
  }
}
