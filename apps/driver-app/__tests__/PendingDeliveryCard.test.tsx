import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { PendingDeliveryCard } from '../src/components/PendingDeliveryCard';

const stops = [
  { icon: 'store' as const, label: 'Coleta', address: 'Rua da Loja, 10' },
  { icon: 'flag' as const, label: 'Entrega', address: 'Rua do Cliente, 20' },
];

function labels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((value): value is string => typeof value === 'string');
}

test('renderiza varios pendentes e mantém uma ação independente por pedido', async () => {
  const acceptFirst = jest.fn();
  const acceptSecond = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <>
        <PendingDeliveryCard
          displayNumber={101}
          time="19:53"
          companyName="Loja A"
          serviceTypeName="Motoboy"
          distanceLabel="0,9 km"
          amountLabel="R$ 9,20"
          stops={stops}
          batch={false}
          accepting={false}
          disabled={false}
          onAccept={acceptFirst}
        />
        <PendingDeliveryCard
          displayNumber={102}
          time="19:54"
          companyName="Loja B"
          serviceTypeName="Motoboy"
          distanceLabel="1,2 km"
          amountLabel="R$ 11,00"
          stops={stops}
          batch={false}
          accepting={false}
          disabled={false}
          onAccept={acceptSecond}
        />
      </>,
    );
  });

  const firstButton = renderer.root.findByProps({ accessibilityLabel: 'Aceitar pedido 101' });
  const secondButton = renderer.root.findByProps({ accessibilityLabel: 'Aceitar pedido 102' });

  expect(firstButton.props.accessibilityState).toEqual({ disabled: false, busy: false });
  expect(secondButton.props.accessibilityState).toEqual({ disabled: false, busy: false });

  await ReactTestRenderer.act(() => secondButton.props.onPress());
  expect(acceptFirst).not.toHaveBeenCalled();
  expect(acceptSecond).toHaveBeenCalledTimes(1);
});

test('mostra o pedido em aceite e desabilita nova resposta', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <PendingDeliveryCard
        displayNumber={103}
        time="19:55"
        companyName="Loja C"
        serviceTypeName="Motoboy"
        distanceLabel="2 km"
        amountLabel="R$ 15,00"
        stops={stops}
        batch
        accepting
        disabled
        onAccept={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toContain('Aceitando...');
  expect(labels(renderer)).toContain('Lote');
  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Aceitar pedido 103' }).props
      .accessibilityState,
  ).toEqual({ disabled: true, busy: true });
});
