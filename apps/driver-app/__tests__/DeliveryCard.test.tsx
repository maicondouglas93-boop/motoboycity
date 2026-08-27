import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DeliveryCard } from '../src/components/DeliveryCard';

function labels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((value): value is string => typeof value === 'string');
}

const basicStops = [
  { icon: 'house' as const, address: 'Rua da Coleta, 10' },
  { icon: 'pin' as const, address: 'Rua da Entrega, 20' },
];

test('mostra o pedido aceito no layout compacto com a rota', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DeliveryCard
        displayNumber={24}
        time="13:22"
        companyName="Loja Centro"
        deliveryStatus="ACCEPTED"
        supportingLabel="Faturado"
        distanceLabel="1.4 km"
        amountLabel="R$ 5,85"
        stops={basicStops}
        onPress={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining([
      '#24',
      'Aceito',
      '13:22',
      'Loja Centro',
      'Faturado',
      '1.4 km',
      'R$ 5,85',
      'Rua da Coleta, 10',
      'Rua da Entrega, 20',
      'Todos os detalhes',
    ]),
  );
  expect(labels(renderer)).not.toContain('Coletado');
  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Abrir pedido 24, Aceito',
    }).props.accessibilityRole,
  ).toBe('button');
});

test('mostra a tag Coletado quando o pedido segue para a entrega', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DeliveryCard
        displayNumber={25}
        companyName="Loja Bairro"
        deliveryStatus="COLLECTED"
        supportingLabel="Faturado"
        stops={basicStops}
        onPress={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining(['#25', 'Loja Bairro', 'Coletado', 'Faturado']),
  );
});
