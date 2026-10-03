import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DatePickerModal } from '../src/components/DatePickerModal';

type Renderer = ReactTestRenderer.ReactTestRenderer;

/** O primeiro elemento tocável com este rótulo de acessibilidade. */
function botao(renderer: Renderer, rotulo: string) {
  return renderer.root.find(
    (node) => node.props.accessibilityLabel === rotulo && typeof node.props.onPress === 'function',
  );
}

function mesMostrado(renderer: Renderer): string {
  const titulo = renderer.root.find(
    (node) => node.type === Text && node.props.accessibilityRole === 'header',
  );
  return ([] as unknown[]).concat(titulo.props.children).join('');
}

async function abrir(props: Partial<React.ComponentProps<typeof DatePickerModal>> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let renderer!: Renderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <DatePickerModal
        visible
        title="A partir de que dia?"
        value="2026-09-15"
        maxDate="2026-10-03"
        onSelect={onSelect}
        onClose={onClose}
        {...props}
      />,
    );
  });
  return { renderer, onSelect, onClose };
}

test('abre no mês da data marcada e devolve o dia tocado, sem teclado', async () => {
  const { renderer, onSelect } = await abrir();

  expect(mesMostrado(renderer)).toBe('Setembro de 2026');

  await ReactTestRenderer.act(() => botao(renderer, '22 de setembro de 2026').props.onPress());
  expect(onSelect).toHaveBeenCalledWith('2026-09-22');
});

test('dia depois do limite fica bloqueado, e não dá para avançar além do mês do limite', async () => {
  const { renderer } = await abrir({ value: '2026-10-01' });

  expect(mesMostrado(renderer)).toBe('Outubro de 2026');
  expect(botao(renderer, '4 de outubro de 2026').props.disabled).toBe(true);
  expect(botao(renderer, '3 de outubro de 2026').props.disabled).toBe(false);
  expect(botao(renderer, 'Próximo mês').props.disabled).toBe(true);
});

test('anda para o mês anterior, virando o ano, e respeita o limite inicial', async () => {
  const { renderer } = await abrir({
    value: '2026-01-10',
    minDate: '2025-12-20',
    maxDate: '2026-10-03',
  });

  await ReactTestRenderer.act(() => botao(renderer, 'Mês anterior').props.onPress());
  expect(mesMostrado(renderer)).toBe('Dezembro de 2025');
  expect(botao(renderer, '19 de dezembro de 2025').props.disabled).toBe(true);
  expect(botao(renderer, '20 de dezembro de 2025').props.disabled).toBe(false);
  expect(botao(renderer, 'Mês anterior').props.disabled).toBe(true);
});

test('tocar fora do calendário fecha sem escolher', async () => {
  const { renderer, onSelect, onClose } = await abrir();

  await ReactTestRenderer.act(() => botao(renderer, 'Fechar calendário').props.onPress());
  expect(onClose).toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});
