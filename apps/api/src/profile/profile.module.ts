import { Module } from '@nestjs/common';
import { ImageKitModule } from '../media/imagekit.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [ImageKitModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
