import { Module } from '@nestjs/common';
import { StoreCatalogModule } from '../store-catalog/store-catalog.module';
import { StoreAsaasAccountService } from './store-asaas-account.service';
import { StoreAsaasCredentialsService } from './store-asaas-credentials.service';
import { StoreAsaasClient } from './store-asaas.client';
import { StoreAsaasController } from './store-asaas.controller';

@Module({
  imports: [StoreCatalogModule],
  controllers: [StoreAsaasController],
  providers: [StoreAsaasAccountService, StoreAsaasCredentialsService, StoreAsaasClient],
  exports: [StoreAsaasAccountService, StoreAsaasClient],
})
export class StoreAsaasModule {}
