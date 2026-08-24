import { HttpException, Injectable } from '@nestjs/common';
import type {
  VirtualSecretaryChatPayload,
  VirtualSecretaryChatResult,
} from '@motoboycity/types';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { GroqService } from '../../ai/groq.service';
import { VirtualSecretaryAuditService } from './virtual-secretary-audit.service';
import {
  VIRTUAL_SECRETARY_TOOL_DECLARATIONS,
  VirtualSecretaryToolsService,
} from './virtual-secretary-tools.service';

@Injectable()
export class VirtualSecretaryService {
  constructor(
    private readonly groq: GroqService,
    private readonly tools: VirtualSecretaryToolsService,
    private readonly audit: VirtualSecretaryAuditService,
  ) {}

  async chat(user: User, payload: VirtualSecretaryChatPayload): Promise<VirtualSecretaryChatResult> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const toolNames: string[] = [];

    try {
      const response = await this.groq.answer({
        message: payload.message,
        history: payload.history ?? [],
        declarations: VIRTUAL_SECRETARY_TOOL_DECLARATIONS,
        executeTool: async (name, args) => {
          const toolStartedAt = Date.now();
          try {
            const execution = await this.tools.execute(name, args, user);
            toolNames.push(name);
            await this.audit.record({
              requestId,
              adminId: user.id,
              action: 'TOOL_EXECUTION',
              toolName: name,
              parameters: this.keysOnly(execution.parameters),
              result: this.keysOnly(execution.result),
              status: 'SUCCESS',
              durationMs: Date.now() - toolStartedAt,
            });
            return execution.result;
          } catch (error) {
            await this.audit.record({
              requestId,
              adminId: user.id,
              action: 'TOOL_EXECUTION',
              toolName: name,
              parameters: { keys: Object.keys(args) },
              status: 'ERROR',
              errorMessage: this.safeError(error),
              durationMs: Date.now() - toolStartedAt,
            });
            throw error;
          }
        },
      });

      await this.audit.record({
        requestId,
        adminId: user.id,
        action: 'CHAT_REQUEST',
        parameters: {
          messageLength: payload.message.length,
          historyCount: payload.history?.length ?? 0,
        },
        result: { toolNames, answerLength: response.answer.length },
        status: 'SUCCESS',
        durationMs: Date.now() - startedAt,
      });

      return {
        requestId,
        answer: response.answer,
        toolNames: [...new Set(toolNames)],
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.audit.record({
        requestId,
        adminId: user.id,
        action: 'CHAT_REQUEST',
        parameters: {
          messageLength: payload.message.length,
          historyCount: payload.history?.length ?? 0,
        },
        result: { toolNames },
        status: 'ERROR',
        errorMessage: this.safeError(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private safeError(error: unknown): string {
    if (error instanceof HttpException) return `Consulta rejeitada (${error.getStatus()}).`;
    return 'Falha interna na consulta.';
  }

  private keysOnly(value: Record<string, unknown>): { keys: string[] } {
    return { keys: Object.keys(value).sort() };
  }
}
