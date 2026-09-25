import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { StoreCatalog, StoreCategory, StoreProduct } from '@motoboycity/types';
import {
  reorderStoreCategoriesSchema,
  reorderStoreProductsSchema,
  storeCategoryNameSchema,
  updateStoreProductStatusSchema,
  upsertStoreProductSchema,
  type ReorderStoreCategoriesPayload,
  type ReorderStoreProductsPayload,
  type StoreCategoryNamePayload,
  type UpdateStoreProductStatusPayload,
  type UpsertStoreProductPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { UploadedImageFile } from '../../media/supported-image';
import { StoreCatalogService } from './store-catalog.service';

const TAMANHO_MAXIMO_DA_FOTO = 5 * 1024 * 1024;
// Montar o cardápio é subir dezenas de fotos seguidas: o limite é o do abuso,
// e não o do uso.
const ENVIO_DE_FOTO_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/**
 * O catálogo da loja online no painel da empresa.
 *
 * As rotas `.../order` vêm antes das `.../:id`: o Nest casa na ordem em que
 * são declaradas, e "order" seria lido como um id.
 */
@Controller('company/store')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreCatalogController {
  constructor(private readonly storeCatalogService: StoreCatalogService) {}

  @Get('catalog')
  catalog(@CurrentUser() user: User): Promise<StoreCatalog> {
    return this.storeCatalogService.catalog(user);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(storeCategoryNameSchema)) body: StoreCategoryNamePayload,
  ): Promise<StoreCategory> {
    return this.storeCatalogService.createCategory(user, body);
  }

  @Put('categories/order')
  reorderCategories(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(reorderStoreCategoriesSchema)) body: ReorderStoreCategoriesPayload,
  ): Promise<StoreCategory[]> {
    return this.storeCatalogService.reorderCategories(user, body);
  }

  @Put('categories/:id')
  renameCategory(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(storeCategoryNameSchema)) body: StoreCategoryNamePayload,
  ): Promise<StoreCategory> {
    return this.storeCatalogService.renameCategory(user, id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.storeCatalogService.deleteCategory(user, id);
  }

  @Post('products')
  createProduct(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(upsertStoreProductSchema)) body: UpsertStoreProductPayload,
  ): Promise<StoreProduct> {
    return this.storeCatalogService.createProduct(user, body);
  }

  @Put('products/order')
  reorderProducts(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(reorderStoreProductsSchema)) body: ReorderStoreProductsPayload,
  ): Promise<StoreProduct[]> {
    return this.storeCatalogService.reorderProducts(user, body);
  }

  @Put('products/:id')
  updateProduct(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertStoreProductSchema)) body: UpsertStoreProductPayload,
  ): Promise<StoreProduct> {
    return this.storeCatalogService.updateProduct(user, id, body);
  }

  @Put('products/:id/status')
  updateProductStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStoreProductStatusSchema))
    body: UpdateStoreProductStatusPayload,
  ): Promise<StoreProduct> {
    return this.storeCatalogService.updateProductStatus(user, id, body.status);
  }

  @Delete('products/:id')
  deleteProduct(@CurrentUser() user: User, @Param('id') id: string): Promise<{ deleted: true }> {
    return this.storeCatalogService.deleteProduct(user, id);
  }

  /** A foto vai por arquivo (campo `file`), e o servidor a guarda no ImageKit. */
  @Put('products/:id/image')
  @Throttle(ENVIO_DE_FOTO_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: TAMANHO_MAXIMO_DA_FOTO } }),
  )
  setProductImage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImageFile,
  ): Promise<StoreProduct> {
    if (!file) throw new BadRequestException('Selecione uma foto para o produto.');
    return this.storeCatalogService.setProductImage(user, id, file);
  }

  @Delete('products/:id/image')
  removeProductImage(@CurrentUser() user: User, @Param('id') id: string): Promise<StoreProduct> {
    return this.storeCatalogService.removeProductImage(user, id);
  }
}
