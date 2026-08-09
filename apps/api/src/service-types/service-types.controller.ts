import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { listServiceTypesQuerySchema, type ListServiceTypesQuery } from '@motoboycity/validation';
import { AdminServiceTypesService, type ServiceTypeItem } from '../admin/service-types/admin-service-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

/**
 * Catálogo de tipos de serviço para leitura por qualquer autenticado
 * (empresa escolhendo serviço ao criar pedido, motoboy vendo detalhes,
 * etc.) — não é gestão, que continua só em /admin/service-types.
 */
@Controller('service-types')
@UseGuards(JwtAuthGuard)
export class ServiceTypesController {
  constructor(private readonly adminServiceTypesService: AdminServiceTypesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listServiceTypesQuerySchema)) query: ListServiceTypesQuery,
  ): Promise<ServiceTypeItem[]> {
    return this.adminServiceTypesService.list(query);
  }
}
