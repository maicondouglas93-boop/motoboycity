import {
  Body,
  BadRequestException,
  Delete,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  changeAdminPasswordSchema,
  createAdminDriverSchema,
  listDriversQuerySchema,
  replaceDriverServiceTypesSchema,
  type ChangeAdminPasswordPayload,
  type CreateAdminDriverPayload,
  type ListDriversQuery,
  type ReplaceDriverServiceTypesPayload,
  adminUpdateDriverSchema,
  adminDriverDocumentSchema,
  adminReviewDriverDocumentSchema,
  type AdminUpdateDriverPayload,
  type AdminDriverDocumentPayload,
  type AdminReviewDriverDocumentPayload,
  revokeDriverPunishmentSchema,
  type RevokeDriverPunishmentPayload,
} from '@motoboycity/validation';
import type { AdminDriverPunishmentItem, AdminPasswordChangeResult } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { AuthService, type RegisterDriverResult } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuditService } from '../audit/admin-audit.service';
import {
  AdminDriversService,
  type AdminDriverListItem,
  type UploadedDriverDocumentFile,
  type AdminDriverRegistrationOptions,
  type DriverAccountStatusResult,
  type DriverReviewResult,
  type DriverServiceTypesResult,
} from './admin-drivers.service';
import { DriverPunishmentService } from '../../driver-punishment/driver-punishment.service';

@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminDriversController {
  private readonly logger = new Logger(AdminDriversController.name);

  constructor(
    private readonly adminDriversService: AdminDriversService,
    private readonly authService: AuthService,
    private readonly audit: AdminAuditService,
    private readonly punishmentService: DriverPunishmentService,
  ) {}

  @Get('registration-options')
  registrationOptions(): Promise<AdminDriverRegistrationOptions> {
    return this.adminDriversService.registrationOptions();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createAdminDriverSchema)) body: CreateAdminDriverPayload,
    @CurrentUser() admin: User,
  ): Promise<RegisterDriverResult> {
    const result = await this.authService.registerDriver(
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
    await this.audit.record({
      actorUserId: admin.id,
      action: 'DRIVER_CREATED',
      entityType: 'DRIVER',
      entityId: result.driverId,
      summary: `Entregador ${body.name} cadastrado pelo administrador.`,
    });
    return result;
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listDriversQuerySchema)) query: ListDriversQuery,
  ): Promise<AdminDriverListItem[]> {
    return this.adminDriversService.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.adminDriversService.detail(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateDriverSchema)) body: AdminUpdateDriverPayload,
    @CurrentUser() admin: User,
  ) {
    return this.adminDriversService.update(id, body, admin.id);
  }

  @Post(':id/documents')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 8 * 1024 * 1024 } }))
  uploadDocument(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminDriverDocumentSchema)) body: AdminDriverDocumentPayload,
    @UploadedFile() file: UploadedDriverDocumentFile | undefined,
    @CurrentUser() admin: User,
  ) {
    if (!file) throw new BadRequestException('Selecione uma imagem ou PDF do documento.');
    return this.adminDriversService.uploadDocument(id, body, file, admin.id);
  }

  @Patch(':id/documents/:documentId/review')
  reviewDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(adminReviewDriverDocumentSchema))
    body: AdminReviewDriverDocumentPayload,
    @CurrentUser() admin: User,
  ) {
    return this.adminDriversService.reviewDocument(id, documentId, body, admin.id);
  }

  @Delete(':id/documents/:documentId')
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() admin: User,
  ) {
    return this.adminDriversService.deleteDocument(id, documentId, admin.id);
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
  suspend(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.suspend(id, admin.id);
  }

  @Patch(':id/block')
  block(@Param('id') id: string, @CurrentUser() admin: User): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.block(id, admin.id);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @CurrentUser() admin: User,
  ): Promise<DriverAccountStatusResult> {
    return this.adminDriversService.reactivate(id, admin.id);
  }

  @Patch(':id/password')
  async changePassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeAdminPasswordSchema)) body: ChangeAdminPasswordPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminPasswordChangeResult> {
    const result = await this.adminDriversService.changePassword(id, body.password, admin.id);
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
    @CurrentUser() admin: User,
  ): Promise<DriverServiceTypesResult> {
    return this.adminDriversService.replaceServiceTypes(id, body, admin.id);
  }

  @Get(':id/punishments')
  punishments(@Param('id') id: string): Promise<AdminDriverPunishmentItem[]> {
    return this.punishmentService.listForDriver(id);
  }

  @Post(':id/punishments/:punishmentId/revoke')
  revokePunishment(
    @Param('id') id: string,
    @Param('punishmentId') punishmentId: string,
    @Body(new ZodValidationPipe(revokeDriverPunishmentSchema))
    body: RevokeDriverPunishmentPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminDriverPunishmentItem> {
    return this.adminDriversService.revokePunishment(id, punishmentId, body.reason, admin.id);
  }
}
