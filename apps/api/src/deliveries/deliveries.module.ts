import { Module } from '@nestjs/common';
import { GoogleMapsModule } from '../maps/google-maps.module';
import { PricingModule } from '../pricing/pricing.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [PricingModule, GoogleMapsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
