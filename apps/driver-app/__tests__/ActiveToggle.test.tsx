import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ActiveToggle } from '../src/components/ActiveToggle';

describe('ActiveToggle', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fica online imediatamente sem pedir confirmacao', async () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ActiveToggle value={false} onChange={onChange} />);
    });

    const toggle = renderer.root.findByProps({
      accessibilityLabel: 'Inativo, tocar para ficar online',
    });

    await ReactTestRenderer.act(() => {
      toggle.props.onPress();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('pede confirmacao antes de ficar offline e so desliga ao confirmar', async () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ActiveToggle value onChange={onChange} />);
    });

    const toggle = renderer.root.findByProps({
      accessibilityLabel: 'Ativo, tocar para ficar offline',
    });

    await ReactTestRenderer.act(() => {
      toggle.props.onPress();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Ficar offline?',
      expect.stringContaining('Tem certeza que deseja ficar offline?'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancelar', style: 'cancel' }),
        expect.objectContaining({ text: 'Ficar offline', style: 'destructive' }),
      ]),
      { cancelable: true },
    );

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirmButton = buttons.find((button) => button.text === 'Ficar offline');

    await ReactTestRenderer.act(() => {
      confirmButton?.onPress?.();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test('mantem online quando o motoboy cancela a confirmacao', async () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ActiveToggle value onChange={onChange} />);
    });

    const toggle = renderer.root.findByProps({
      accessibilityLabel: 'Ativo, tocar para ficar offline',
    });

    await ReactTestRenderer.act(() => {
      toggle.props.onPress();
    });

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const cancelButton = buttons.find((button) => button.text === 'Cancelar');

    await ReactTestRenderer.act(() => {
      cancelButton?.onPress?.();
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  test('ignora o toque quando esta desabilitado', async () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ActiveToggle value onChange={onChange} disabled />,
      );
    });

    const toggle = renderer.root.findByProps({
      accessibilityLabel: 'Ativo, tocar para ficar offline',
    });

    await ReactTestRenderer.act(() => {
      toggle.props.onPress();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
