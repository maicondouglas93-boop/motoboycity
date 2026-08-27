import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DriverQueueSheet } from '../src/components/DriverQueueSheet';

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  return '';
}

function labels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map((node) => textContent(node.props.children));
}

test('mostra a posicao e expande os entregadores na ordem real', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DriverQueueSheet
        visible
        queue={{
          queueName: 'Geral',
          currentPosition: 3,
          totalDrivers: 3,
          generatedAt: '2026-08-27T16:00:00.000Z',
          drivers: [
            { position: 1, name: 'Rosemar da Silva', isCurrentDriver: false },
            { position: 2, name: 'Carioca Motoboy', isCurrentDriver: false },
            { position: 3, name: 'Maicon Douglas', isCurrentDriver: true },
          ],
        }}
        loading={false}
        error={null}
        onClose={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining([
      'Fila de Entregadores',
      '3 entregadores na fila',
      '#3',
      'Geral',
      'Você está em 3 de 3',
    ]),
  );
  expect(labels(renderer)).not.toContain('Rosemar da Silva');

  await ReactTestRenderer.act(() => {
    renderer.root.findByProps({ accessibilityLabel: 'Expandir fila geral' }).props.onPress();
  });

  expect(labels(renderer)).toEqual(
    expect.arrayContaining([
      '#1',
      'Rosemar da Silva',
      '#2',
      'Carioca Motoboy',
      '#3',
      'Maicon Douglas (Você)',
    ]),
  );
});
