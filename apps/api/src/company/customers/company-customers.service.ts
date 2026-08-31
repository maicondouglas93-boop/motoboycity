import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CompanyCustomer,
  CompanyCustomerDetail,
  CompanyCustomerRankingItem,
  CompanyCustomerRankingResult,
  CompanyCustomerSavedAddress,
  CompanyCustomerStatistics,
} from '@motoboycity/types';
import type {
  CompanyCustomerSavedAddressPayload,
  CompanyCustomerRankingQuery,
  CreateCompanyCustomerPayload,
  ListCompanyCustomersQuery,
  MatchCompanyCustomerQuery,
  UpdateCompanyCustomerPayload,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleMapsService } from '../../maps/google-maps.service';

interface CustomerRow {
  id: string;
  name: string;
  cpf: string | null;
  phone: string;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: { toString(): string } | null;
  lng: { toString(): string } | null;
  referenceNote: string | null;
  savedAddresses: SavedAddressRow[];
  createdAt: Date;
  updatedAt: Date;
}

interface SavedAddressRow {
  id: string;
  label: string;
  isPrimary: boolean;
  street: string;
  number: string;
  complement: string | null;
  city: string;
  state: string;
  zip: string;
  lat: { toString(): string } | null;
  lng: { toString(): string } | null;
  referenceNote: string | null;
}

interface DeliveryStatisticsRow {
  totalDeliveries: bigint;
  lastDeliveryAt: Date | null;
  inProgressDeliveries: bigint;
  completedDeliveries: bigint;
  cancelledDeliveries: bigint;
}

interface CustomerRankingRow {
  id: string;
  name: string;
  phone: string;
  totalDeliveries: bigint;
  completedDeliveries: bigint;
  inProgressDeliveries: bigint;
  cancelledDeliveries: bigint;
  lastDeliveryAt: Date | null;
}

interface MostUsedAddressRow {
  street: string;
  number: string | null;
  complement: string | null;
  city: string;
  state: string;
  zip: string | null;
  deliveries: bigint;
}

const SAVED_ADDRESS_ORDER: Prisma.CompanyCustomerSavedAddressOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { label: 'asc' },
];

export function normalizeCustomerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class CompanyCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  /**
   * Garante a coordenada do endereco salvo do cliente.
   *
   * O painel resolve o endereco pelo Google Places, que so devolve resultado
   * com ponto geografico — entao hoje a coordenada quase sempre chega pronta e
   * este caminho nem roda. Ele existe para o que NAO passa pelo painel: o
   * contrato aceita endereco sem `lat`/`lng`, e um endereco salvo sem ponto vira
   * uma armadilha silenciosa — ao escolher aquele cliente, o pedido e barrado
   * com "selecione no Google um endereco completo", sem dizer que o problema
   * esta no cadastro.
   *
   * Nunca impede o cadastro. A agenda de clientes nao pode depender do Google
   * estar de pe: sem coordenada o cliente e salvo do mesmo jeito, e quem
   * decide se ela faz falta e a regra de proximidade, la na entrega.
   */
  private async resolverCoordenadaDoCliente(address: {
    street: string;
    number: string;
    complement?: string | null;
    city: string;
    state: string;
    zip: string;
    lat?: number;
    lng?: number;
  }): Promise<{ lat: number | null; lng: number | null }> {
    if (address.lat !== undefined && address.lng !== undefined) {
      return { lat: address.lat, lng: address.lng };
    }

    const formatado = [
      `${address.street}, ${address.number}`,
      address.city,
      address.state,
      address.zip,
    ]
      .filter(Boolean)
      .join(' - ');

    try {
      return (await this.googleMapsService.geocode(formatado)) ?? { lat: null, lng: null };
    } catch {
      return { lat: null, lng: null };
    }
  }

  /**
   * Roda SEMPRE fora da transacao: geocodificar e chamada de rede, e segurar
   * uma transacao aberta esperando o Google prenderia conexao do banco.
   */
  private async addressDataComCoordenada(address: CreateCompanyCustomerPayload['address']) {
    const ponto = await this.resolverCoordenadaDoCliente(address);
    return { ...this.addressData(address), lat: ponto.lat, lng: ponto.lng };
  }

  async list(
    user: User,
    query: ListCompanyCustomersQuery,
  ): Promise<{ items: CompanyCustomer[]; total: number; page: number; pageSize: number }> {
    const companyId = await this.resolveCompanyId(user);
    const digits = query.q?.replace(/\D/g, '') ?? '';
    const normalizedQuery = query.q ? normalizeCustomerName(query.q) : '';
    const search = query.q
      ? {
          OR: [
            { normalizedName: { contains: normalizedQuery } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {};
    const where: Prisma.CompanyCustomerWhereInput = { companyId, ...search };

    const [rows, total] = await Promise.all([
      this.prisma.companyCustomer.findMany({
        where,
        include: { savedAddresses: { orderBy: SAVED_ADDRESS_ORDER } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.companyCustomer.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(user: User, id: string): Promise<CompanyCustomerDetail> {
    const companyId = await this.resolveCompanyId(user);
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId },
      include: { savedAddresses: { orderBy: SAVED_ADDRESS_ORDER } },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
    return {
      ...this.toItem(customer),
      statistics: await this.statistics(
        companyId,
        customer.id,
        customer.phone,
        customer.savedAddresses,
      ),
    };
  }

  async ranking(
    user: User,
    query: CompanyCustomerRankingQuery,
  ): Promise<CompanyCustomerRankingResult> {
    const companyId = await this.resolveCompanyId(user);
    const rows = await this.prisma.$queryRaw<CustomerRankingRow[]>`
      SELECT
        c."id",
        c."name",
        c."phone",
        COUNT(d."id")::bigint AS "totalDeliveries",
        COUNT(d."id") FILTER (WHERE d."status" = 'COMPLETED')::bigint AS "completedDeliveries",
        COUNT(d."id") FILTER (
          WHERE d."status" NOT IN ('COMPLETED', 'CANCELLED')
        )::bigint AS "inProgressDeliveries",
        COUNT(d."id") FILTER (WHERE d."status" = 'CANCELLED')::bigint AS "cancelledDeliveries",
        MAX(d."createdAt") AS "lastDeliveryAt"
      FROM "company_customers" AS c
      LEFT JOIN "deliveries" AS d
        ON d."companyId" = c."companyId"
        AND (
          d."companyCustomerId" = c."id"
          OR (
            d."companyCustomerId" IS NULL
            AND (
              CASE
                WHEN length(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')) IN (12, 13)
                  AND left(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g'), 2) = '55'
                THEN substring(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g') FROM 3)
                ELSE regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')
              END
            ) = c."phone"
          )
        )
      WHERE c."companyId" = ${companyId}
      GROUP BY c."id", c."name", c."phone"
      HAVING COUNT(d."id") > 0
      ORDER BY
        COUNT(d."id") FILTER (WHERE d."status" = 'COMPLETED') DESC,
        MAX(d."createdAt") DESC NULLS LAST,
        COUNT(d."id") DESC,
        c."name" ASC,
        c."id" ASC
      LIMIT ${query.limit}
    `;

    return { items: rows.map((row) => this.toRankingItem(row)) };
  }

  async match(
    user: User,
    identifiers: MatchCompanyCustomerQuery,
  ): Promise<{ customer: CompanyCustomer | null }> {
    const companyId = await this.resolveCompanyId(user);
    const matches = await this.prisma.companyCustomer.findMany({
      where: {
        companyId,
        OR: [
          ...(identifiers.cpf ? [{ cpf: identifiers.cpf }] : []),
          ...(identifiers.phone ? [{ phone: identifiers.phone }] : []),
        ],
      },
      include: { savedAddresses: { orderBy: SAVED_ADDRESS_ORDER } },
      take: 2,
    });
    if (matches.length > 1) {
      throw new ConflictException('O CPF e o telefone pertencem a clientes diferentes.');
    }
    return { customer: matches[0] ? this.toItem(matches[0]) : null };
  }

  async create(user: User, payload: CreateCompanyCustomerPayload): Promise<CompanyCustomer> {
    const companyId = await this.resolveCompanyId(user);
    await this.assertNoDuplicate(companyId, payload.cpf, payload.phone);
    const enderecoComPonto = await this.addressDataComCoordenada(payload.address);

    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        const created = await tx.companyCustomer.create({
          data: {
            companyId,
            name: payload.name,
            normalizedName: normalizeCustomerName(payload.name),
            cpf: payload.cpf ?? null,
            phone: payload.phone,
            ...enderecoComPonto,
            savedAddresses: {
              create: {
                label: payload.addressLabel,
                normalizedLabel: normalizeCustomerName(payload.addressLabel),
                isPrimary: true,
                ...enderecoComPonto,
              },
            },
          },
          include: { savedAddresses: { orderBy: SAVED_ADDRESS_ORDER } },
        });
        await this.linkUnassignedDeliveries(tx, companyId, created.id, payload.phone);
        return created;
      });
      return this.toItem(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async update(
    user: User,
    id: string,
    payload: UpdateCompanyCustomerPayload,
  ): Promise<CompanyCustomer> {
    const companyId = await this.resolveCompanyId(user);
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId },
      select: { id: true, phone: true },
    });
    if (!existing) throw new NotFoundException('Cliente nao encontrado.');

    await this.assertNoDuplicate(companyId, payload.cpf, payload.phone, id);
    const enderecoComPonto = await this.addressDataComCoordenada(payload.address);
    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        await this.linkUnassignedDeliveries(tx, companyId, id, existing.phone);
        const updated = await tx.companyCustomer.update({
          where: { id },
          data: {
            name: payload.name,
            normalizedName: normalizeCustomerName(payload.name),
            cpf: payload.cpf ?? null,
            phone: payload.phone,
            ...enderecoComPonto,
            savedAddresses: {
              updateMany: {
                where: { isPrimary: true },
                data: {
                  label: payload.addressLabel,
                  normalizedLabel: normalizeCustomerName(payload.addressLabel),
                  ...enderecoComPonto,
                },
              },
            },
          },
          include: { savedAddresses: { orderBy: SAVED_ADDRESS_ORDER } },
        });
        await this.linkUnassignedDeliveries(tx, companyId, id, payload.phone);
        return updated;
      });
      return this.toItem(customer);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async createAddress(
    user: User,
    customerId: string,
    payload: CompanyCustomerSavedAddressPayload,
  ): Promise<CompanyCustomerSavedAddress> {
    const companyId = await this.resolveCompanyId(user);
    await this.assertCustomerOwnership(companyId, customerId);
    const enderecoComPonto = await this.addressDataComCoordenada(payload.address);
    try {
      const address = await this.prisma.companyCustomerSavedAddress.create({
        data: {
          customerId,
          label: payload.label,
          normalizedLabel: normalizeCustomerName(payload.label),
          isPrimary: false,
          ...enderecoComPonto,
        },
      });
      return this.toSavedAddress(address);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async updateAddress(
    user: User,
    customerId: string,
    addressId: string,
    payload: CompanyCustomerSavedAddressPayload,
  ): Promise<CompanyCustomerSavedAddress> {
    const companyId = await this.resolveCompanyId(user);
    const existing = await this.prisma.companyCustomerSavedAddress.findFirst({
      where: { id: addressId, customerId, customer: { companyId } },
    });
    if (!existing) throw new NotFoundException('Endereco do cliente nao encontrado.');
    const enderecoComPonto = await this.addressDataComCoordenada(payload.address);

    try {
      const address = await this.prisma.$transaction(async (tx) => {
        if (existing.isPrimary) {
          await tx.companyCustomer.update({
            where: { id: customerId },
            data: enderecoComPonto,
          });
        }
        return tx.companyCustomerSavedAddress.update({
          where: { id: addressId },
          data: {
            label: payload.label,
            normalizedLabel: normalizeCustomerName(payload.label),
            ...enderecoComPonto,
          },
        });
      });
      return this.toSavedAddress(address);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  async removeAddress(
    user: User,
    customerId: string,
    addressId: string,
  ): Promise<{ deleted: true }> {
    const companyId = await this.resolveCompanyId(user);
    const existing = await this.prisma.companyCustomerSavedAddress.findFirst({
      where: { id: addressId, customerId, customer: { companyId } },
      select: { id: true, isPrimary: true },
    });
    if (!existing) throw new NotFoundException('Endereco do cliente nao encontrado.');
    if (existing.isPrimary) {
      throw new ConflictException('O endereco principal nao pode ser excluido.');
    }
    const result = await this.prisma.companyCustomerSavedAddress.deleteMany({
      where: { id: addressId, customerId },
    });
    if (result.count !== 1) throw new NotFoundException('Endereco do cliente nao encontrado.');
    return { deleted: true };
  }

  async remove(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.resolveCompanyId(user);
    const result = await this.prisma.companyCustomer.deleteMany({ where: { id, companyId } });
    if (result.count !== 1) throw new NotFoundException('Cliente nao encontrado.');
    return { deleted: true };
  }

  private async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuario nao esta vinculado a uma empresa ativa.');
    }
    return membership.companyId;
  }

  private async assertNoDuplicate(
    companyId: string,
    cpf: string | undefined,
    phone: string,
    excludedId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.companyCustomer.findFirst({
      where: {
        companyId,
        ...(excludedId && { id: { not: excludedId } }),
        OR: [...(cpf ? [{ cpf }] : []), { phone }],
      },
      select: { cpf: true, phone: true },
    });
    if (!duplicate) return;
    if (cpf && duplicate.cpf === cpf) {
      throw new ConflictException('Ja existe um cliente com este CPF.');
    }
    throw new ConflictException('Ja existe um cliente com este telefone.');
  }

  private async assertCustomerOwnership(companyId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
  }

  private rethrowUniqueConstraint(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        'Ja existe um cliente com este telefone, CPF informado ou nome de endereco.',
      );
    }
  }

  private addressData(address: CreateCompanyCustomerPayload['address']) {
    return {
      street: address.street,
      number: address.number,
      complement: address.complement ?? null,
      city: address.city,
      state: address.state.toUpperCase(),
      zip: address.zip.replace(/\D/g, ''),
      lat: address.lat ?? null,
      lng: address.lng ?? null,
      referenceNote: address.referenceNote ?? null,
    };
  }

  private toItem(customer: CustomerRow): CompanyCustomer {
    const primary = customer.savedAddresses.find((address) => address.isPrimary);
    return {
      id: customer.id,
      name: customer.name,
      cpf: customer.cpf,
      phone: customer.phone,
      addressLabel: primary?.label ?? 'Principal',
      address: {
        street: customer.street,
        number: customer.number,
        complement: customer.complement,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        lat: customer.lat === null ? null : Number(customer.lat),
        lng: customer.lng === null ? null : Number(customer.lng),
        referenceNote: customer.referenceNote,
      },
      addresses: customer.savedAddresses.map((address) => this.toSavedAddress(address)),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private toSavedAddress(address: SavedAddressRow): CompanyCustomerSavedAddress {
    return {
      id: address.id,
      label: address.label,
      isPrimary: address.isPrimary,
      street: address.street,
      number: address.number,
      complement: address.complement,
      city: address.city,
      state: address.state,
      zip: address.zip,
      lat: address.lat === null ? null : Number(address.lat),
      lng: address.lng === null ? null : Number(address.lng),
      referenceNote: address.referenceNote,
    };
  }

  private toRankingItem(row: CustomerRankingRow): CompanyCustomerRankingItem {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      totalDeliveries: Number(row.totalDeliveries),
      completedDeliveries: Number(row.completedDeliveries),
      inProgressDeliveries: Number(row.inProgressDeliveries),
      cancelledDeliveries: Number(row.cancelledDeliveries),
      lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    };
  }

  private async linkUnassignedDeliveries(
    tx: Prisma.TransactionClient,
    companyId: string,
    customerId: string,
    phone: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "deliveries" AS d
      SET "companyCustomerId" = ${customerId}
      WHERE d."companyId" = ${companyId}
        AND d."companyCustomerId" IS NULL
        AND (
          CASE
            WHEN length(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')) IN (12, 13)
              AND left(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g'), 2) = '55'
            THEN substring(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g') FROM 3)
            ELSE regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')
          END
        ) = ${phone}
    `;
  }

  private async statistics(
    companyId: string,
    customerId: string,
    phone: string,
    savedAddresses: SavedAddressRow[],
  ): Promise<CompanyCustomerStatistics> {
    const stats = await this.prisma.$queryRaw<DeliveryStatisticsRow[]>`
      WITH customer_deliveries AS (
        SELECT d."id", d."status", d."createdAt"
        FROM "deliveries" AS d
        WHERE d."companyId" = ${companyId}
          AND (
            d."companyCustomerId" = ${customerId}
            OR (
              d."companyCustomerId" IS NULL
              AND (
                CASE
                  WHEN length(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')) IN (12, 13)
                    AND left(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g'), 2) = '55'
                  THEN substring(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g') FROM 3)
                  ELSE regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')
                END
              ) = ${phone}
            )
          )
      )
      SELECT
        COUNT(*)::bigint AS "totalDeliveries",
        MAX("createdAt") AS "lastDeliveryAt",
        COUNT(*) FILTER (WHERE "status" NOT IN ('COMPLETED', 'CANCELLED'))::bigint AS "inProgressDeliveries",
        COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::bigint AS "completedDeliveries",
        COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::bigint AS "cancelledDeliveries"
      FROM customer_deliveries
    `;
    const mostUsed = await this.prisma.$queryRaw<MostUsedAddressRow[]>`
      WITH customer_deliveries AS (
        SELECT d."id"
        FROM "deliveries" AS d
        WHERE d."companyId" = ${companyId}
          AND (
            d."companyCustomerId" = ${customerId}
            OR (
              d."companyCustomerId" IS NULL
              AND (
                CASE
                  WHEN length(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')) IN (12, 13)
                    AND left(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g'), 2) = '55'
                  THEN substring(regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g') FROM 3)
                  ELSE regexp_replace(COALESCE(d."recipientPhone", ''), '[^0-9]', '', 'g')
                END
              ) = ${phone}
            )
          )
      )
      SELECT
        a."street", a."number", a."complement", a."city", a."state", a."zip",
        COUNT(*)::bigint AS "deliveries"
      FROM customer_deliveries AS d
      INNER JOIN "delivery_addresses" AS a ON a."deliveryId" = d."id" AND a."type" = 'DROPOFF'
      WHERE a."street" IS NOT NULL AND a."city" IS NOT NULL AND a."state" IS NOT NULL
      GROUP BY a."street", a."number", a."complement", a."city", a."state", a."zip"
      ORDER BY COUNT(*) DESC, MAX(d."id") DESC
      LIMIT 5
    `;
    const row = stats[0];
    return {
      totalDeliveries: Number(row?.totalDeliveries ?? 0),
      lastDeliveryAt: row?.lastDeliveryAt?.toISOString() ?? null,
      inProgressDeliveries: Number(row?.inProgressDeliveries ?? 0),
      completedDeliveries: Number(row?.completedDeliveries ?? 0),
      cancelledDeliveries: Number(row?.cancelledDeliveries ?? 0),
      mostUsedAddresses: mostUsed.map((address) => ({
        address: this.formatStatisticsAddress(address),
        savedAddressLabel:
          savedAddresses.find((saved) => this.sameAddress(saved, address))?.label ?? null,
        deliveries: Number(address.deliveries),
      })),
    };
  }

  private sameAddress(saved: SavedAddressRow, used: MostUsedAddressRow): boolean {
    return (
      normalizeCustomerName(saved.street) === normalizeCustomerName(used.street) &&
      normalizeCustomerName(saved.number) === normalizeCustomerName(used.number ?? '') &&
      normalizeCustomerName(saved.city) === normalizeCustomerName(used.city) &&
      saved.state.toUpperCase() === used.state.toUpperCase() &&
      saved.zip.replace(/\D/g, '') === (used.zip ?? '').replace(/\D/g, '')
    );
  }

  private formatStatisticsAddress(address: MostUsedAddressRow): string {
    return `${address.street}, ${address.number ?? 's/n'}${
      address.complement ? ` - ${address.complement}` : ''
    }, ${address.city}/${address.state}`;
  }
}
