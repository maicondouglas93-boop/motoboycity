import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  changeAdminPasswordSchema,
  createAdminDriverSchema,
  listDriversQuerySchema,
  replaceDriverServiceTypesSchema,
  type ChangeAdminPasswordPayload,
  type CreateAdminDriverPayload,
  type ListDriversQuery,
  type ReplaceDriverServiceTypesPayload,
} from '@motoboycity/validation';
import type { AdminPasswordChangeResult } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { AuthService, type RegisterDriverResult } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AdminDriversService,
  type AdminDriverListItem,
  type AdminDriverRegistrationOptions,
  type DriverAccountStatusResult,
  type DriverReviewResult,
  type DriverServiceTypesResult,
} from './admin-drivers.service';

@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminDriversController {
  private readonly logger = new Logger(AdminDriversController.name);

  constructor(
    private readonly adminDriversService: AdminDriversService,
    private readonly authService: AuthService,
  ) {}

  @Get('registration-options')
  registrationOptions(): Promise<AdminDriverRegistrationOptions> {
    return this.adminDriversService.registrationOptions();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createAdminDriverSchema)) body: CreateAdminDriverPayload,
  ): Promise<RegisterDriverResult> {
    return this.authService.registerDriver(
      {
        name: body.name,
        email: body.email,
        phone: body.phone,
        cpf: body.cpf,
        birthDate: body.birthDate,
        pixKey: body.pixKey,
        pixKeyType: body.pixKeyType,
        hasCnpj: body.hasCnpj,
        password: body.password,
      },
      { regionId: body.regionId, serviceTypeIds: body.serviceTypeIds },
    );
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listDriversQuerySchema)) query: ListDriversQuery,
  ): Promise<AdminDriverListItem[]> {
    return this.adminDriversService.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<AdminDriverListItem> {
    return this.adminDriversService.detail(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverReviewResult> {
    return this.adminDriversService.approve(id, admin.id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverReviewResult> {
    return this.adminDriversService.reject(id, admin.id);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.suspend(id);
  }

  @Patch(':id/block')
  block(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.block(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.reactivate(id);
  }

  @Patch(':id/password')
  async changePassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeAdminPasswordSchema)) body: ChangeAdminPasswordPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminPasswordChangeResult> {
    const result = await this.adminDriversService.changePassword(id, body.password);
    this.logger.warn(
      `Admin ${admin.id} redefiniu a credencial do usuário ${result.userId} (motoboy ${id}).`,
    );
    return result;
  }

  @Put(':id/service-types')
  replaceServiceTypes(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceDriverServiceTypesSchema))
    body: ReplaceDriverServiceTypesPayload,
  ): Promise<DriverServiceTypesResult> {
    return this.adminDriversService.replaceServiceTypes(id, body);
  }
}
