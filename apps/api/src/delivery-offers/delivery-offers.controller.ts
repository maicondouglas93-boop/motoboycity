import { Controller, Param, Patch, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryOffersService, type AcceptOfferResult } from './delivery-offers.service';

@Controller('delivery-offers')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DeliveryOffersController {
  constructor(private readonly deliveryOffersService: DeliveryOffersService) {}

  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: User): Promise<AcceptOfferResult> {
    return this.deliveryOffersService.accept(user, id);
  }

  @Patch(':id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: User): Promise<{ ok: true }> {
    return this.deliveryOffersService.decline(user, id);
  }
}
