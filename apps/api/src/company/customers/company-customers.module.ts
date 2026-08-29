import { Module } from '@nestjs/common';
import { GoogleMapsModule } from '../../maps/google-maps.module';
import { CompanyCustomersController } from './company-customers.controller';
import { CompanyCustomersService } from './company-customers.service';

@Module({
  imports: [GoogleMapsModule],
  controllers: [CompanyCustomersController],
  providers: [CompanyCustomersService],
})
export class CompanyCustomersModule {}
