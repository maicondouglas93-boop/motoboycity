import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ApiError } from '@motoboycity/api-client';
import type { DriverScheduleView, DriverWorkSchedule } from '@motoboycity/types';
import { driverScheduleApi } from '../src/lib/apiClient';
import { linhasDaEscala, resumoDaSituacao } from '../src/lib/workSchedule';
import { ScheduleScreen } from '../src/screens/ScheduleScreen';
import { useDispatchStore } from '../src/store/dispatchStore';

jest.mock('../src/lib/apiClient', () => ({
  driverScheduleApi: { get: jest.fn() },
}));

jest.mock('../src/lib/session', () => ({
  session: { getToken: jest.fn(() => Promise.resolve('token-de-teste')) },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const getSchedule = driverScheduleApi.get as jest.MockedFunction<typeof driverScheduleApi.get>;

/** Almoco e jantar na segunda, noite de sexta passando da meia-noite, resto de folga. */
const escala: DriverWorkSchedule = {
  days: [
    { weekday: 0, shifts: [] },
    {
      weekday: 1,
      shifts: [
        { start: '18:00', end: '23:00' },
        { start: '11:00', end: '15:00' },
      ],
    },
    { weekday: 2, shifts: [] },
    { weekday: 3, shifts: [] },
    { weekday: 4, shifts: [] },
    { weekday: 5, shifts: [{ start: '18:00', end: '02:00' }] },
    { weekday: 6, shifts: [] },
  ],
};

const foraDaEscala = {
  onShift: false,
  changesAt: '2026-10-16T14:00:00.000Z',
  label: 'Fora da escala · próximo turno sexta às 11:00',
};

function textos(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(''))
    .filter(Boolean);
}

async function abrirTela() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ScheduleScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ key: 'schedule-test', name: 'Schedule' }}
      />,
    );
  });
  return renderer;
}

describe('linhas da escala', () => {
  it('lista de segunda a domingo, com os turnos em ordem e folga vazia', () => {
    const linhas = linhasDaEscala(escala, 1);

    expect(linhas.map((linha) => linha.dia)).toEqual([
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
      'Domingo',
    ]);
    expect(linhas[0]).toEqual({
      weekday: 1,
      dia: 'Segunda',
      hoje: true,
      turnos: ['11:00 às 15:00', '18:00 às 23:00'],
    });
    expect(linhas[4]?.turnos).toEqual(['18:00 às 02:00 do dia seguinte']);
    expect(linhas[6]).toMatchObject({ weekday: 0, hoje: false, turnos: [] });
  });
});

describe('resumo da situacao', () => {
  it('sem escala ele trabalha livre', () => {
    expect(resumoDaSituacao(null, null)).toMatchObject({ tom: 'livre', titulo: 'Sem escala' });
  });

  it('no turno usa o texto pronto do servidor', () => {
    expect(
      resumoDaSituacao(escala, { onShift: true, changesAt: null, label: 'No turno até 15:00' }),
    ).toMatchObject({ tom: 'no-turno', titulo: 'No turno até 15:00' });
  });

  it('fora da escala separa o titulo do proximo turno', () => {
    const resumo = resumoDaSituacao(escala, foraDaEscala);

    expect(resumo.tom).toBe('fora');
    expect(resumo.titulo).toBe('Fora da escala');
    expect(resumo.texto).toMatch(/^Próximo turno sexta às 11:00\. /);
    expect(resumo.texto).toContain('O que você já aceitou continua valendo.');
  });

  it('fora da escala sem proximo turno conhecido nao inventa horario', () => {
    const resumo = resumoDaSituacao(escala, {
      onShift: false,
      changesAt: null,
      label: 'Fora da escala',
    });

    expect(resumo.titulo).toBe('Fora da escala');
    expect(resumo.texto).toMatch(/^Fora do turno/);
  });
});

describe('tela de escala', () => {
  beforeEach(() => {
    getSchedule.mockReset();
    useDispatchStore.getState().setWorkSchedule(null);
  });

  it('mostra a semana e avisa a Home que ele esta fora da escala', async () => {
    const view: DriverScheduleView = { schedule: escala, status: foraDaEscala };
    getSchedule.mockResolvedValue(view);

    const renderer = await abrirTela();
    const tela = textos(renderer);

    expect(getSchedule).toHaveBeenCalledWith('token-de-teste');
    expect(tela).toEqual(
      expect.arrayContaining([
        'Escala',
        'Fora da escala',
        'Segunda',
        '11:00 às 15:00',
        '18:00 às 23:00',
        '18:00 às 02:00 do dia seguinte',
        'Folga',
        'Quem monta a escala é a central',
      ]),
    );
    expect(useDispatchStore.getState().workSchedule).toEqual(foraDaEscala);

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('sem escala diz que ele pode ficar ativo a qualquer hora', async () => {
    getSchedule.mockResolvedValue({ schedule: null, status: null });

    const renderer = await abrirTela();
    const tela = textos(renderer);

    expect(tela).toEqual(
      expect.arrayContaining([
        'Sem escala',
        'Você pode ficar Ativo e receber pedidos a qualquer hora.',
      ]),
    );
    expect(tela).not.toContain('Folga');

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('mostra o erro da API com a opcao de tentar de novo', async () => {
    getSchedule.mockRejectedValue(
      new ApiError(403, { message: 'Usuário não está vinculado a um cadastro de motoboy.' }),
    );

    const renderer = await abrirTela();

    expect(textos(renderer)).toEqual(
      expect.arrayContaining([
        'Usuário não está vinculado a um cadastro de motoboy.',
        'Tocar para tentar novamente',
      ]),
    );

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
