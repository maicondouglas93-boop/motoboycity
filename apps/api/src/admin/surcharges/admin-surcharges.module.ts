import { Module } from '@nestjs/common';
import { AdminSurchargesController } from './admin-surcharges.controller';
import { AdminSurchargesService } from './admin-surcharges.service';
import { WeatherModule } from '../../weather/weather.module';

@Module({
  imports: [WeatherModule],
  controllers: [AdminSurchargesController],
  providers: [AdminSurchargesService],
})
export class AdminSurchargesModule {}
