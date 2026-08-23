import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import {
  registerDeviceTokenSchema,
  type RegisterDeviceTokenPayload,
} from '@motoboycity/validation';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DeviceTokensService } from './device-tokens.service';

@Controller('driver/push-tokens')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class PushController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  @Post()
  register(
    @Body(new ZodValidationPipe(registerDeviceTokenSchema)) body: RegisterDeviceTokenPayload,
    @CurrentUser() user: User,
  ): Promise<{ ok: true }> {
    return this.deviceTokensService.register(user, body);
  }

  /**
   * Chamado ao sair da conta. E `DELETE` com o token no caminho porque o
   * aplicativo pode nao ter mais sessao valida para montar um corpo — mas o
   * guarda continua exigindo o token de acesso, senao qualquer um calaria as
   * ofertas de qualquer motoboy.
   */
  @Delete(':token')
  unregister(@Param('token') token: string, @CurrentUser() user: User): Promise<{ ok: true }> {
    return this.deviceTokensService.unregister(user, token);
  }
}
