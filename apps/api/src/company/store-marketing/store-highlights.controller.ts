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
import type { DestaqueDaLoja } from '@motoboycity/types';
import {
  storeHighlightActiveSchema,
  storeHighlightOrderSchema,
  storeHighlightSchema,
  type StoreHighlightActivePayload,
  type StoreHighlightOrderPayload,
  type StoreHighlightPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreHighlightsService } from './store-highlights.service';

/** Marketing da loja online, no painel da empresa: os destaques dela. */
@Controller('company/store/marketing/highlights')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreHighlightsController {
  constructor(private readonly destaques: StoreHighlightsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  highlights(@CurrentUser() user: User): Promise<DestaqueDaLoja[]> {
    return this.destaques.highlights(user);
  }

  @Post()
  createHighlight(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeHighlightSchema)) payload: StoreHighlightPayload,
  ): Promise<DestaqueDaLoja> {
    return this.destaques.createHighlight(user, payload);
  }

  /** Antes de `:id`, para "order" não ser lido como um id. */
  @Put('order')
  reorderHighlights(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeHighlightOrderSchema)) { ids }: StoreHighlightOrderPayload,
  ): Promise<DestaqueDaLoja[]> {
    return this.destaques.reorderHighlights(user, ids);
  }

  @Put(':id')
  updateHighlight(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeHighlightSchema)) payload: StoreHighlightPayload,
  ): Promise<DestaqueDaLoja> {
    return this.destaques.updateHighlight(user, id, payload);
  }

  @Patch(':id/active')
  setHighlightActive(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeHighlightActiveSchema)) { ativo }: StoreHighlightActivePayload,
  ): Promise<DestaqueDaLoja> {
    return this.destaques.setHighlightActive(user, id, ativo);
  }

  @Post(':id/duplicate')
  duplicateHighlight(@CurrentUser() user: User, @Param('id') id: string): Promise<DestaqueDaLoja> {
    return this.destaques.duplicateHighlight(user, id);
  }

  @Delete(':id')
  deleteHighlight(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.destaques.deleteHighlight(user, id);
  }
}
