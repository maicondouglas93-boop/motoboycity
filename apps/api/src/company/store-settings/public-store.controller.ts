import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicStoreLookup } from '@motoboycity/types';
import { storeSlugLookupSchema } from '@motoboycity/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreSettingsService } from './store-settings.service';

/**
 * A loja online como o cliente a vê: aberta, sem login. Devolve só o que a
 * página mostra — nada de situação de produto, empresa ou data de edição.
 */
@Controller('public/stores')
export class PublicStoreController {
  constructor(private readonly storeSettingsService: StoreSettingsService) {}

  @Get(':slug')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  store(
    @Param('slug', new ZodValidationPipe(storeSlugLookupSchema)) slug: string,
  ): Promise<PublicStoreLookup> {
    return this.storeSettingsService.publicStore(slug);
  }
}
