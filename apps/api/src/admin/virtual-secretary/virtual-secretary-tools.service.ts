import { BadRequestException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { z } from 'zod';
import type { AiToolDeclaration } from '../../ai/ai.types';
import { AdminCompaniesService } from '../companies/admin-companies.service';
import { AdminDriversService } from '../drivers/admin-drivers.service';
import { AdminOperationsService } from '../operations/admin-operations.service';
import { AdminReportsService } from '../reports/admin-reports.service';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import {
  resolveVirtualSecretaryPeriod,
  VIRTUAL_SECRETARY_PERIODS,
  type VirtualSecretaryPeriod,
} from './virtual-secretary-period';

const deliveryStatuses = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
  'AWAITING_PAYMENT',
] as const;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z
  .object({
    period: z.enum(VIRTUAL_SECRETARY_PERIODS),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .strict();
const deliverySearchSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(deliveryStatuses).optional(),
    period: z.enum(VIRTUAL_SECRETARY_PERIODS).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .strict();
const textSearchSchema = z.object({ query: z.string().trim().max(100).default('') }).strict();
const noQuerySchema = z
  .object({
    category: z.enum(['SAUDACAO', 'FORA_DO_ESCOPO', 'ACAO_NAO_PERMITIDA']),
  })
  .strict();

export const VIRTUAL_SECRETARY_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: 'gerar_resumo_administrativo',
    description: 'Gera um resumo de hoje com pedidos, receita, operação e motoboys online.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'consultar_relatorio_periodo',
    description:
      'Consulta pedidos, entregas concluídas, cancelamentos, faturamento e rankings em um período.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: VIRTUAL_SECRETARY_PERIODS },
        from: { type: 'string', description: 'AAAA-MM-DD, obrigatório apenas em CUSTOM' },
        to: { type: 'string', description: 'AAAA-MM-DD, obrigatório apenas em CUSTOM' },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_operacao_atual',
    description: 'Consulta filas atuais, pedidos ativos, cancelamentos recentes e motoboys online.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'buscar_pedidos',
    description: 'Busca até cinco pedidos por número, texto, status e período, sem dados pessoais.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        status: { type: 'string', enum: deliveryStatuses },
        period: { type: 'string', enum: VIRTUAL_SECRETARY_PERIODS },
        from: { type: 'string', description: 'AAAA-MM-DD' },
        to: { type: 'string', description: 'AAAA-MM-DD' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_empresas',
    description: 'Busca até cinco empresas por nome e retorna somente situação e volume total.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_entregadores',
    description: 'Busca até cinco motoboys e retorna apenas situação operacional e modalidades.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'responder_sem_consulta',
    description: 'Use para saudação, assunto fora do escopo ou pedido de alteração não permitida.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['SAUDACAO', 'FORA_DO_ESCOPO', 'ACAO_NAO_PERMITIDA'],
        },
      },
      required: ['category'],
      additionalProperties: false,
    },
  },
];

export interface VirtualSecretaryToolResult {
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
}

@Injectable()
export class VirtualSecretaryToolsService {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly operations: AdminOperationsService,
    private readonly companies: AdminCompaniesService,
    private readonly drivers: AdminDriversService,
    private readonly deliveries: DeliveriesService,
  ) {}

  async execute(
    name: string,
    args: Record<string, unknown>,
    user: User,
  ): Promise<VirtualSecretaryToolResult> {
    switch (name) {
      case 'gerar_resumo_administrativo': {
        const parameters = this.parse(z.object({}).strict(), args);
        const [report, operation] = await Promise.all([
          this.reportFor({ period: 'TODAY' }),
          this.currentOperation(user),
        ]);
        return { parameters, result: { report, operation } };
      }
      case 'consultar_relatorio_periodo': {
        const parameters = this.parse(periodSchema, args);
        return { parameters, result: await this.reportFor(parameters) };
      }
      case 'consultar_operacao_atual': {
        const parameters = this.parse(z.object({}).strict(), args);
        return { parameters, result: await this.currentOperation(user) };
      }
      case 'buscar_pedidos': {
        const parameters = this.parse(deliverySearchSchema, args);
        const range = parameters.period
          ? resolveVirtualSecretaryPeriod(parameters.period, parameters)
          : parameters.from && parameters.to
            ? resolveVirtualSecretaryPeriod('CUSTOM', parameters)
            : undefined;
        const result = await this.deliveries.searchAdminSummary(user, {
          q: parameters.q,
          status: parameters.status,
          from: range?.from,
          to: range?.to,
          page: 1,
          pageSize: 5,
        });
        return { parameters, result: { total: result.total, items: result.items } };
      }
      case 'buscar_empresas': {
        const parameters = this.parse(textSearchSchema, args);
        const items = await this.companies.searchSummary(parameters.query, 5);
        return {
          parameters,
          result: {
            items: items.map((item) => ({
              id: item.id,
              name: item.tradeName,
              legalName: item.legalName,
              status: item.status,
              deliveriesCount: item._count.deliveries,
              createdAt: item.createdAt.toISOString(),
            })),
          },
        };
      }
      case 'buscar_entregadores': {
        const parameters = this.parse(textSearchSchema, args);
        const items = await this.drivers.searchSummary(parameters.query, 5);
        return {
          parameters,
          result: {
            items: items.map((item) => ({
              id: item.id,
              name: item.user.name,
              approvalStatus: item.approvalStatus,
              accountStatus: item.accountStatus,
              availability: item.availability,
              lastSeenAt: item.lastSeenAt?.toISOString() ?? null,
              serviceTypes: item.serviceTypes.map((entry) => ({
                name: entry.serviceType.name,
                isPrimary: entry.isPrimary,
              })),
            })),
          },
        };
      }
      case 'responder_sem_consulta': {
        const parameters = this.parse(noQuerySchema, args);
        const messages = {
          SAUDACAO: 'Posso consultar a operação, relatórios, pedidos, empresas e motoboys.',
          FORA_DO_ESCOPO: 'Esse assunto não pertence à administração da MOTOboyCity.',
          ACAO_NAO_PERMITIDA:
            'Esta versão é somente leitura e não pode alterar dados nem executar ações.',
        };
        return { parameters, result: { message: messages[parameters.category] } };
      }
      default:
        throw new BadRequestException('A ferramenta solicitada não é permitida.');
    }
  }

  private async reportFor(parameters: {
    period: VirtualSecretaryPeriod;
    from?: string;
    to?: string;
  }): Promise<Record<string, unknown>> {
    const range = resolveVirtualSecretaryPeriod(parameters.period, parameters);
    const report = await this.reports.operations({ from: range.from, to: range.to });
    return {
      period: range,
      live: report.live,
      ordersCreated: report.ordersCreated,
      deliveriesCompleted: report.deliveriesCompleted,
      comparison: report.comparison,
      topCompanies: report.companies.slice(0, 5).map((item) => ({
        name: item.companyName,
        createdCount: item.createdCount,
        completedCount: item.completedCount,
        cancelledCount: item.cancelledCount,
        completedTotalValue: item.completedTotalValue,
      })),
      topDrivers: report.drivers.slice(0, 5).map((item) => ({
        name: item.driverName,
        completedCount: item.completedCount,
        driverValue: item.driverValue,
        completionRate: item.completionRate,
      })),
    };
  }

  private async currentOperation(user: User): Promise<Record<string, unknown>> {
    const operation = await this.operations.overview(user, {});
    return {
      generatedAt: operation.generatedAt,
      counts: operation.counts,
      activeCount: operation.active.length,
      cancelledLast15Minutes: operation.recent.length,
      activeOrders: operation.active.slice(0, 10).map((item) => ({
        number: item.displayNumber,
        companyName: item.companyName,
        status: item.status,
        driverName: item.driver?.name ?? null,
        statusChangedAt: item.statusChangedAt,
      })),
      onlineDriversCount: operation.onlineDrivers.length,
      onlineDrivers: operation.onlineDrivers.slice(0, 10).map((item) => ({
        name: item.name,
        availabilitySince: item.availabilitySince,
        serviceTypes: item.serviceTypes.map((serviceType) => serviceType.name),
        activeDeliveryCount: item.activeDeliveryIds.length,
      })),
    };
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException('Os parâmetros da consulta gerada pela IA são inválidos.');
    }
    return parsed.data;
  }
}
