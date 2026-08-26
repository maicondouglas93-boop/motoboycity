import {
  Body,
  Controller,
  Delete,
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
import type {
  AdminCompanyRegistrationOptions,
  AdminPasswordChangeResult,
  RegisterCompanyResult,
} from '@motoboycity/types';
import {
  changeAdminPasswordSchema,
  createAdminCompanySchema,
  listCompaniesQuerySchema,
  updateCompanyProfileSchema,
  upsertCompanyAddressSchema,
  adminUpdateCompanySchema,
  adminCompanyAddressSchema,
  adminCreateCompanyMemberSchema,
  adminUpdateCompanyMemberSchema,
  adminUpdateCompanyBillingSettingsSchema,
  type ChangeAdminPasswordPayload,
  type CreateAdminCompanyPayload,
  type ListCompaniesQuery,
  type UpdateCompanyProfilePayload,
  type UpsertCompanyAddressPayload,
  type AdminUpdateCompanyPayload,
  type AdminCompanyAddressPayload,
  type AdminCreateCompanyMemberPayload,
  type AdminUpdateCompanyMemberPayload,
  type AdminUpdateCompanyBillingSettingsPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { AuthService } from '../../auth/auth.service';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuditService } from '../audit/admin-audit.service';
import {
  AdminCompaniesService,
  type AdminCompanyDetail,
  type AdminCompanyListItem,
  type ApproveCompanyResult,
} from './admin-companies.service';

@Controller('admin/companies')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminCompaniesController {
  private readonly logger = new Logger(AdminCompaniesController.name);

  constructor(
    private readonly adminCompaniesService: AdminCompaniesService,
    private readonly authService: AuthService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get('registration-options')
  registrationOptions(): Promise<AdminCompanyRegistrationOptions> {
    return this.adminCompaniesService.registrationOptions();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createAdminCompanySchema)) body: CreateAdminCompanyPayload,
    @CurrentUser() admin: User,
  ): Promise<RegisterCompanyResult> {
    const result = await this.authService.registerCompany(
      {
        name: body.name,
        email: body.email,
        phone: body.phone,
        document: body.document,
        legalName: body.legalName,
        tradeName: body.tradeName,
        password: body.password,
      },
      { regionId: body.regionId },
    );
    await this.audit.record({
      actorUserId: admin.id,
      action: 'COMPANY_CREATED',
      entityType: 'COMPANY',
      entityId: result.companyId,
      summary: `Empresa ${body.tradeName} cadastrada pelo administrador.`,
    });
    this.logger.log(`Admin ${admin.id} cadastrou a empresa ${result.companyId}.`);
    return result;
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listCompaniesQuerySchema)) query: ListCompaniesQuery,
  ): Promise<AdminCompanyListItem[]> {
    return this.adminCompaniesService.list(query.status);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.detail(id);
  }

  @Put(':id/profile')
  async updateProfile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCompanyProfileSchema)) body: UpdateCompanyProfilePayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    const result = await this.adminCompaniesService.updateProfile(id, body, admin.id);
    this.logger.log(`Admin ${admin.id} atualizou o cadastro da empresa ${id}.`);
    return result;
  }

  @Put(':id')
  updateCompany(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateCompanySchema)) body: AdminUpdateCompanyPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.updateCompany(id, body, admin.id);
  }

  @Put(':id/billing-settings')
  updateBillingSettings(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateCompanyBillingSettingsSchema))
    body: AdminUpdateCompanyBillingSettingsPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.updateBillingSettings(id, body, admin.id);
  }

  @Post(':id/addresses')
  addAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminCompanyAddressSchema)) body: AdminCompanyAddressPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.addAddress(id, body, admin.id);
  }

  @Put(':id/addresses/:addressId')
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(adminCompanyAddressSchema)) body: AdminCompanyAddressPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.updateAddress(id, addressId, body, admin.id);
  }

  @Delete(':id/addresses/:addressId')
  deleteAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.deleteAddress(id, addressId, admin.id);
  }

  @Post(':id/team-members')
  addMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminCreateCompanyMemberSchema))
    body: AdminCreateCompanyMemberPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.addMember(id, body, admin.id);
  }

  @Put(':id/team-members/:memberId')
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(adminUpdateCompanyMemberSchema))
    body: AdminUpdateCompanyMemberPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.updateMember(id, memberId, body, admin.id);
  }

  @Patch(':id/team-members/:memberId/deactivate')
  deactivateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.setMemberActive(id, memberId, false, admin.id);
  }

  @Patch(':id/team-members/:memberId/reactivate')
  reactivateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    return this.adminCompaniesService.setMemberActive(id, memberId, true, admin.id);
  }

  @Put(':id/address')
  async upsertPrimaryAddress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertCompanyAddressSchema)) body: UpsertCompanyAddressPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    const result = await this.adminCompaniesService.upsertPrimaryAddress(id, body, admin.id);
    this.logger.log(`Admin ${admin.id} atualizou o endereco principal da empresa ${id}.`);
    return result;
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() admin: User): Promise<ApproveCompanyResult> {
    return this.adminCompaniesService.approve(id, admin.id);
  }

  @Patch(':id/suspend')
  async suspend(@Param('id') id: string, @CurrentUser() admin: User): Promise<AdminCompanyDetail> {
    const result = await this.adminCompaniesService.suspend(id, admin.id);
    this.logger.warn(`Admin ${admin.id} suspendeu a empresa ${id}.`);
    return result;
  }

  @Patch(':id/reactivate')
  async reactivate(
    @Param('id') id: string,
    @CurrentUser() admin: User,
  ): Promise<AdminCompanyDetail> {
    const result = await this.adminCompaniesService.reactivate(id, admin.id);
    this.logger.warn(`Admin ${admin.id} reativou a empresa ${id}.`);
    return result;
  }

  @Patch(':id/team-members/:memberId/password')
  async changeMemberPassword(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(changeAdminPasswordSchema)) body: ChangeAdminPasswordPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminPasswordChangeResult> {
    const result = await this.adminCompaniesService.changeMemberPassword(
      id,
      memberId,
      body.password,
      admin.id,
    );
    this.logger.warn(
      `Admin ${admin.id} redefiniu a credencial do usuário ${result.userId} na empresa ${id}.`,
    );
    return result;
  }
}
