import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  publicDeliveryTrackingTokenSchema,
  type PublicDeliveryTrackingToken,
} from '@motoboycity/validation';
import type { PublicDeliveryTracking } from '@motoboycity/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DeliveryTrackingService } from './delivery-tracking.service';

@Controller('public/tracking')
export class PublicDeliveryTrackingController {
  constructor(private readonly deliveryTrackingService: DeliveryTrackingService) {}

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  detail(
    @Param('token', new ZodValidationPipe(publicDeliveryTrackingTokenSchema))
    token: PublicDeliveryTrackingToken,
  ): Promise<PublicDeliveryTracking> {
    return this.deliveryTrackingService.publicDetail(token);
  }
}
