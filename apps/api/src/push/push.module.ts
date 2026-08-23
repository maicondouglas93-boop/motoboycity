import { Module } from '@nestjs/common';
import { DeviceTokensService } from './device-tokens.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushController],
  providers: [PushService, DeviceTokensService],
  exports: [PushService],
})
export class PushModule {}
