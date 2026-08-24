import { BadRequestException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AdminCompaniesService } from '../companies/admin-companies.service';
import type { AdminDriversService } from '../drivers/admin-drivers.service';
import type { AdminOperationsService } from '../operations/admin-operations.service';
import type { AdminReportsService } from '../reports/admin-reports.service';
import type { DeliveriesService } from '../../deliveries/deliveries.service';
import {
  VIRTUAL_SECRETARY_TOOL_DECLARATIONS,
  VirtualSecretaryToolsService,
} from './virtual-secretary-tools.service';

describe('VirtualSecretaryToolsService', () => {
  const user = { id: 'admin-1', type: 'ADMIN' } as User;
  const operations = {
    overview: jest.fn().mockResolvedValue({
      generatedAt: '2026-08-23T15:00:00.000Z',
      counts: { ACCEPTED: 1 },
      active: [
        {
          displayNumber: 1163,
          companyName: 'Empresa teste',
          status: 'ACCEPTED',
          statusChangedAt: '2026-08-23T14:00:00.000Z',
          driver: { name: 'Motoboy teste', phone: '33999999999' },
          addresses: [{ street: 'Rua privada', lat: -19.9 }],
        },
      ],
      recent: [],
      onlineDrivers: [
        {
          name: 'Motoboy teste',
          phone: '33999999999',
          location: { lat: -19.9, lng: -43.9 },
          availabilitySince: null,
          serviceTypes: [{ name: 'Moto' }],
          activeDeliveryIds: ['delivery-1'],
        },
      ],
    }),
  };
  const service = new VirtualSecretaryToolsService(
    {} as AdminReportsService,
    operations as unknown as AdminOperationsService,
    {} as AdminCompaniesService,
    {} as AdminDriversService,
    {} as DeliveriesService,
  );

  it('remove telefone, endereço e coordenadas do retrato operacional', async () => {
    const execution = await service.execute('consultar_operacao_atual', {}, user);
    const serialized = JSON.stringify(execution.result);

    expect(serialized).not.toContain('33999999999');
    expect(serialized).not.toContain('Rua privada');
    expect(serialized).not.toContain('-19.9');
    expect(serialized).toContain('Motoboy teste');
  });

  it('não expõe nenhuma ferramenta de escrita e recusa nome fora da allowlist', async () => {
    const names = VIRTUAL_SECRETARY_TOOL_DECLARATIONS.map((tool) => tool.name);
    expect(names).not.toContain('cancelar_pedido');
    expect(names).not.toContain('alterar_preco');
    await expect(service.execute('cancelar_pedido', { id: '1163' }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
