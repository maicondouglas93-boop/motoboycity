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

test('destaca em verde o caminho ate a coleta sem adicionar uma tag redundante', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DeliveryCard
        displayNumber={24}
        time="13:22"
        companyName="Loja Centro"
        deliveryStatus="ACCEPTED"
        supportingLabel="Faturado"
        onPress={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining(['#24 · Loja Centro', 'A caminho da coleta', 'Faturado', '\u2192']),
  );
  expect(labels(renderer)).not.toContain('Coletado');
  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Abrir pedido 24, A caminho da coleta',
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
        onPress={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining(['#25 · Loja Bairro', 'A caminho da entrega', 'Coletado', 'Faturado']),
  );
});
