import { Body, Controller, Delete, Get, Header, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ContaAsaasDaLoja } from '@motoboycity/types';
import { storeAsaasAccountSchema, type StoreAsaasAccountPayload } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreAsaasAccountService } from './store-asaas-account.service';

/** A conta Asaas da loja, em Configurações: ver, ligar e desligar. */
@Controller('company/store/asaas-account')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreAsaasController {
  constructor(private readonly contas: StoreAsaasAccountService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  conta(@CurrentUser() user: User): Promise<ContaAsaasDaLoja> {
    return this.contas.conta(user);
  }

  /** Cada tentativa pergunta ao Asaas: poucas por minuto, para não virar teste de chaves. */
  @Put()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  conectar(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeAsaasAccountSchema)) payload: StoreAsaasAccountPayload,
  ): Promise<ContaAsaasDaLoja> {
    return this.contas.conectar(user, payload);
  }

  @Delete()
  desconectar(@CurrentUser() user: User): Promise<ContaAsaasDaLoja> {
    return this.contas.desconectar(user);
  }
}
