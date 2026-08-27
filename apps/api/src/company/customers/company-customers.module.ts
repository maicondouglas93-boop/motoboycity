import { Module } from '@nestjs/common';
import { CompanyCustomersController } from './company-customers.controller';
import { CompanyCustomersService } from './company-customers.service';

@Module({
  controllers: [CompanyCustomersController],
  providers: [CompanyCustomersService],
})
export class CompanyCustomersModule {}
