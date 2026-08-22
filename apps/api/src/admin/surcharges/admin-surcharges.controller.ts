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
import { upsertSurchargeSchema, type UpsertSurchargePayload } from '@motoboycity/validation';
import type { SurchargeItem } from '@motoboycity/types';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
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
  ): Promise<SurchargeItem> {
    return this.adminSurchargesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertSurchargeSchema)) body: UpsertSurchargePayload,
  ): Promise<SurchargeItem> {
    return this.adminSurchargesService.update(id, body);
  }

  /** O interruptor manual, separado para ligar e desligar em um clique. */
  @Patch(':id/turn-on')
  turnOn(@Param('id') id: string): Promise<SurchargeItem> {
    return this.adminSurchargesService.setManuallyActive(id, true);
  }

  @Patch(':id/turn-off')
  turnOff(@Param('id') id: string): Promise<SurchargeItem> {
    return this.adminSurchargesService.setManuallyActive(id, false);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string): Promise<SurchargeItem> {
    return this.adminSurchargesService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string): Promise<SurchargeItem> {
    return this.adminSurchargesService.setActive(id, false);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.adminSurchargesService.remove(id);
  }
}
