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
import type { PromocaoDaLoja } from '@motoboycity/types';
import {
  storePromotionActiveSchema,
  storePromotionSchema,
  type StorePromotionActivePayload,
  type StorePromotionPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreMarketingService } from './store-marketing.service';

/** Marketing da loja online, no painel da empresa: as promoções dela. */
@Controller('company/store/marketing')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreMarketingController {
  constructor(private readonly marketing: StoreMarketingService) {}

  @Get('promotions')
  @Header('Cache-Control', 'no-store')
  promotions(@CurrentUser() user: User): Promise<PromocaoDaLoja[]> {
    return this.marketing.promotions(user);
  }

  @Post('promotions')
  createPromotion(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storePromotionSchema)) payload: StorePromotionPayload,
  ): Promise<PromocaoDaLoja> {
    return this.marketing.createPromotion(user, payload);
  }

  @Put('promotions/:id')
  updatePromotion(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storePromotionSchema)) payload: StorePromotionPayload,
  ): Promise<PromocaoDaLoja> {
    return this.marketing.updatePromotion(user, id, payload);
  }

  @Patch('promotions/:id/active')
  setPromotionActive(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storePromotionActiveSchema)) { ativa }: StorePromotionActivePayload,
  ): Promise<PromocaoDaLoja> {
    return this.marketing.setPromotionActive(user, id, ativa);
  }

  @Post('promotions/:id/duplicate')
  duplicatePromotion(@CurrentUser() user: User, @Param('id') id: string): Promise<PromocaoDaLoja> {
    return this.marketing.duplicatePromotion(user, id);
  }

  @Delete('promotions/:id')
  deletePromotion(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.marketing.deletePromotion(user, id);
  }
}
