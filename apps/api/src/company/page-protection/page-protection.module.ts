import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PageProtectionController } from './page-protection.controller';
import { PageProtectionGuard } from './page-protection.guard';
import { PageProtectionService } from './page-protection.service';

@Module({
  imports: [AuthModule],
  controllers: [PageProtectionController],
  providers: [PageProtectionService, PageProtectionGuard],
  exports: [PageProtectionService, PageProtectionGuard],
})
export class PageProtectionModule {}
