import { Module } from '@nestjs/common';
import { AdminRegionsController } from './admin-regions.controller';
import { AdminRegionsService } from './admin-regions.service';

@Module({ controllers: [AdminRegionsController], providers: [AdminRegionsService] })
export class AdminRegionsModule {}
