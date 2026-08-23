import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryOffersService, type AcceptOfferResult } from './delivery-offers.service';

@Controller('delivery-offers')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DeliveryOffersController {
  constructor(private readonly deliveryOffersService: DeliveryOffersService) {}

  /**
   * A vitrine, num controller proprio de rota: `/delivery-offers` e sobre
   * ofertas dirigidas, e estes pedidos justamente NAO tem oferta.
   */
  @Get('available')
  listAvailable(@CurrentUser() user: User) {
    return this.deliveryOffersService.listAvailable(user);
  }

  /**
   * Precisa vir antes de qualquer rota com parametro: o Nest casa na ordem de
   * declaracao, e `:id/accept` engoliria `pending`.
   */
  @Get('pending')
  pending(@CurrentUser() user: User) {
    return this.deliveryOffersService.pending(user);
  }

  @Patch('available/:id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: User): Promise<AcceptOfferResult> {
    return this.deliveryOffersService.claim(user, id);
  }

  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: User): Promise<AcceptOfferResult> {
    return this.deliveryOffersService.accept(user, id);
  }

  @Patch(':id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: User): Promise<{ ok: true }> {
    return this.deliveryOffersService.decline(user, id);
  }
}
