import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Conexão é preguiçosa (Prisma conecta na primeira query), de propósito:
 * nesta fase a API precisa subir e responder /health mesmo sem Postgres disponível.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
