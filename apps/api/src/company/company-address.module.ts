import { Module } from '@nestjs/common';
import { CompanyAddressController } from './company-address.controller';
import { CompanyAddressService } from './company-address.service';

@Module({
  controllers: [CompanyAddressController],
  providers: [CompanyAddressService],
})
export class CompanyAddressModule {}
