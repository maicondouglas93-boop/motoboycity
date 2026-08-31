import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
})
export class CompanyProfileModule {}
