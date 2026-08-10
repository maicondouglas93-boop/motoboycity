import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DeliveryOffersController } from './delivery-offers.controller';
import { DeliveryOffersService } from './delivery-offers.service';

@Module({
  imports: [DispatchModule],
  controllers: [DeliveryOffersController],
  providers: [DeliveryOffersService],
})
export class DeliveryOffersModule {}
