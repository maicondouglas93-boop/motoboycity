import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { AdminRegion } from '@motoboycity/types';
import { adminRegionSchema, type AdminRegionPayload } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminRegionsService } from './admin-regions.service';

@Controller('admin/regions')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminRegionsController {
  constructor(private readonly service: AdminRegionsService) {}
  @Get() list(): Promise<AdminRegion[]> {
    return this.service.list();
  }
  @Post() create(
    @Body(new ZodValidationPipe(adminRegionSchema)) body: AdminRegionPayload,
    @CurrentUser() admin: User,
  ) {
    return this.service.create(body, admin.id);
  }
  @Put(':id') update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminRegionSchema)) body: AdminRegionPayload,
    @CurrentUser() admin: User,
  ) {
    return this.service.update(id, body, admin.id);
  }
  @Patch(':id/deactivate') deactivate(@Param('id') id: string, @CurrentUser() admin: User) {
    return this.service.setActive(id, false, admin.id);
  }
  @Patch(':id/reactivate') reactivate(@Param('id') id: string, @CurrentUser() admin: User) {
    return this.service.setActive(id, true, admin.id);
  }
}
