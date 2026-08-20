import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import {
  driverPresenceHeartbeatSchema,
  setDriverPresenceSchema,
  type DriverPresenceHeartbeatPayload,
  type SetDriverPresencePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DriverPresenceService, type DriverPresenceItem } from './driver-presence.service';

@Controller('driver/presence')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DriverPresenceController {
  constructor(private readonly driverPresenceService: DriverPresenceService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<DriverPresenceItem> {
    return this.driverPresenceService.get(user);
  }

  @Put()
  set(
    @Body(new ZodValidationPipe(setDriverPresenceSchema)) body: SetDriverPresencePayload,
    @CurrentUser() user: User,
  ): Promise<DriverPresenceItem> {
    return this.driverPresenceService.setAvailability(user, body);
  }

  @Post('heartbeat')
  heartbeat(
    @Body(new ZodValidationPipe(driverPresenceHeartbeatSchema))
    body: DriverPresenceHeartbeatPayload,
    @CurrentUser() user: User,
  ): Promise<DriverPresenceItem> {
    return this.driverPresenceService.heartbeat(user, body);
  }
}
