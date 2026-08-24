import { Injectable } from '@nestjs/common';
import { Prisma, type VirtualSecretaryAuditStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface VirtualSecretaryAuditInput {
  requestId: string;
  adminId: string;
  action: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: VirtualSecretaryAuditStatus;
  errorMessage?: string;
  durationMs?: number;
}

@Injectable()
export class VirtualSecretaryAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: VirtualSecretaryAuditInput): Promise<void> {
    await this.prisma.virtualSecretaryAudit.create({
      data: {
        requestId: input.requestId,
        adminId: input.adminId,
        action: input.action,
        toolName: input.toolName,
        parameters: input.parameters as Prisma.InputJsonValue | undefined,
        result: input.result as Prisma.InputJsonValue | undefined,
        status: input.status,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
      },
    });
  }
}
