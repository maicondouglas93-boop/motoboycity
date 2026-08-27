import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { CompanyCustomer } from '@motoboycity/types';
import {
  createCompanyCustomerSchema,
  listCompanyCustomersQuerySchema,
  matchCompanyCustomerQuerySchema,
  updateCompanyCustomerSchema,
  type CreateCompanyCustomerPayload,
  type ListCompanyCustomersQuery,
  type MatchCompanyCustomerQuery,
  type UpdateCompanyCustomerPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyCustomersService } from './company-customers.service';

@Controller('company/customers')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyCustomersController {
  constructor(private readonly companyCustomersService: CompanyCustomersService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(listCompanyCustomersQuerySchema)) query: ListCompanyCustomersQuery,
  ) {
    return this.companyCustomersService.list(user, query);
  }

  @Get('match')
  match(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(matchCompanyCustomerQuerySchema)) query: MatchCompanyCustomerQuery,
  ): Promise<{ customer: CompanyCustomer | null }> {
    return this.companyCustomersService.match(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: User, @Param('id') id: string): Promise<CompanyCustomer> {
    return this.companyCustomersService.detail(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createCompanyCustomerSchema)) body: CreateCompanyCustomerPayload,
  ): Promise<CompanyCustomer> {
    return this.companyCustomersService.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCompanyCustomerSchema)) body: UpdateCompanyCustomerPayload,
  ): Promise<CompanyCustomer> {
    return this.companyCustomersService.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.companyCustomersService.remove(user, id);
  }
}
