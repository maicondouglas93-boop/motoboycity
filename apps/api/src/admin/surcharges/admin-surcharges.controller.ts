import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  upsertSurchargeSchema,
  setSurchargeRainAutomationSchema,
  type UpsertSurchargePayload,
  type SetSurchargeRainAutomationPayload,
} from '@motoboycity/validation';
import type { SurchargeItem } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminSurchargesService } from './admin-surcharges.service';

@Controller('admin/surcharges')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminSurchargesController {
  constructor(private readonly adminSurchargesService: AdminSurchargesService) {}

  @Get()
  list(): Promise<SurchargeItem[]> {
    return this.adminSurchargesService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(upsertSurchargeSchema)) body: UpsertSurchargePayload,
    @CurrentUser() admin: User,
  ): Promise<SurchargeItem> {
    return this.adminSurchargesService.create(body, admin.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertSurchargeSchema)) body: UpsertSurchargePayload,
    @CurrentUser() admin: User,
  ): Promise<SurchargeItem> {
    return this.adminSurchargesService.update(id, body, admin.id);
  }

  /** Modo persistido e auditado; não altera valor, repasse ou habilitação geral. */
  @Patch(':id/rain-automation')
  setRainAutomation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setSurchargeRainAutomationSchema))
    body: SetSurchargeRainAutomationPayload,
    @CurrentUser() admin: User,
  ): Promise<SurchargeItem> {
    return this.adminSurchargesService.setRainAutomation(id, body.enabled, admin.id);
  }

  @Patch(':id/turn-on')
  turnOn(@Param('id') id: string, @CurrentUser() admin: User): Promise<SurchargeItem> {
    return this.adminSurchargesService.setManuallyActive(id, true, admin.id);
  }

  @Patch(':id/turn-off')
  turnOff(@Param('id') id: string, @CurrentUser() admin: User): Promise<SurchargeItem> {
    return this.adminSurchargesService.setManuallyActive(id, false, admin.id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() admin: User): Promise<SurchargeItem> {
    return this.adminSurchargesService.setActive(id, true, admin.id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() admin: User): Promise<SurchargeItem> {
    return this.adminSurchargesService.setActive(id, false, admin.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() admin: User): Promise<void> {
    return this.adminSurchargesService.remove(id, admin.id);
  }
}
