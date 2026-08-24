import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { VirtualSecretaryChatResult } from '@motoboycity/types';
import {
  virtualSecretaryChatSchema,
  type VirtualSecretaryChatPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VirtualSecretaryService } from './virtual-secretary.service';

const AI_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('admin/virtual-secretary')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class VirtualSecretaryController {
  constructor(private readonly service: VirtualSecretaryService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle(AI_THROTTLE)
  chat(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(virtualSecretaryChatSchema)) body: VirtualSecretaryChatPayload,
  ): Promise<VirtualSecretaryChatResult> {
    return this.service.chat(user, body);
  }
}
