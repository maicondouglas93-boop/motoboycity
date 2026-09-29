import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { CupomDaLoja } from '@motoboycity/types';
import {
  storeCouponActiveSchema,
  storeCouponSchema,
  type StoreCouponActivePayload,
  type StoreCouponPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreCouponsService } from './store-coupons.service';

/** Marketing da loja online, no painel da empresa: os cupons dela. */
@Controller('company/store/marketing/coupons')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreCouponsController {
  constructor(private readonly cupons: StoreCouponsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  coupons(@CurrentUser() user: User): Promise<CupomDaLoja[]> {
    return this.cupons.coupons(user);
  }

  @Post()
  createCoupon(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeCouponSchema)) payload: StoreCouponPayload,
  ): Promise<CupomDaLoja> {
    return this.cupons.createCoupon(user, payload);
  }

  @Put(':id')
  updateCoupon(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeCouponSchema)) payload: StoreCouponPayload,
  ): Promise<CupomDaLoja> {
    return this.cupons.updateCoupon(user, id, payload);
  }

  @Patch(':id/active')
  setCouponActive(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeCouponActiveSchema)) { ativo }: StoreCouponActivePayload,
  ): Promise<CupomDaLoja> {
    return this.cupons.setCouponActive(user, id, ativo);
  }

  @Post(':id/duplicate')
  duplicateCoupon(@CurrentUser() user: User, @Param('id') id: string): Promise<CupomDaLoja> {
    return this.cupons.duplicateCoupon(user, id);
  }

  @Delete(':id')
  deleteCoupon(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.cupons.deleteCoupon(user, id);
  }
}
