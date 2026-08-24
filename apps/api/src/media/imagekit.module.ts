import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImageKitService } from './imagekit.service';

@Module({
  imports: [ConfigModule],
  providers: [ImageKitService],
  exports: [ImageKitService],
})
export class ImageKitModule {}
