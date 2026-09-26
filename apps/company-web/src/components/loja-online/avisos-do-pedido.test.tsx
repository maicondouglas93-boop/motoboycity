import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisosDoPedido } from '@/components/loja-online/avisos-do-pedido';
import { paletaDoTema } from '@/components/loja-online/paleta';

/**
 * "Avisar quando o pedido andar": só aparece com o worker da loja registrado
 * (produção), e ligar manda a inscrição com o token do cliente.
 */

const mocks = vi.hoisted(() => ({
  chavePublica: vi.fn(),
  inscreverAvisos: vi.fn(),
  tokenDoCliente: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  webPushApi: { chavePublica: mocks.chavePublica },
  publicStoreOrdersApi: { inscreverAvisos: mocks.inscreverAvisos },
}));
vi.mock('@/lib/firebase-da-loja', () => ({ tokenDoCliente: mocks.tokenDoCliente }));

const ENDERECO = 'https://fcm.googleapis.com/fcm/send/cliente-1';

function navegador(comWorkerDaLoja: boolean) {
  const registro = {
    active: {},
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({
        toJSON: () => ({ endpoint: ENDERECO, keys: { p256dh: 'p', auth: 'a' } }),
      }),
    },
  };
  const serviceWorker = {
    getRegistration: vi.fn((escopo: string) =>
      Promise.resolve(comWorkerDaLoja && escopo === '/pedir/acai' ? registro : undefined),
    ),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal(
    'Notification',
    Object.assign(function Notification() {}, {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    }),
  );
}

const PALETA = paletaDoTema('CLARO');

beforeEach(() => {
  mocks.chavePublica.mockResolvedValue('AQID-_8');
  mocks.inscreverAvisos.mockResolvedValue(undefined);
  mocks.tokenDoCliente.mockResolvedValue('token-do-cliente');
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('Avisar quando o pedido andar', () => {
  it('com o worker da loja, liga e manda a inscrição com o token do cliente', async () => {
    navegador(true);
    render(<AvisosDoPedido slug="acai" paleta={PALETA} cor="#15803d" />);

    fireEvent.click(await screen.findByRole('button', { name: /Avisar quando o pedido andar/ }));

    await waitFor(() =>
      expect(mocks.inscreverAvisos).toHaveBeenCalledWith('acai', 'token-do-cliente', {
        endpoint: ENDERECO,
        keys: { p256dh: 'p', auth: 'a' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('mesmo com a página fechada');
  });

  it('sem o worker da loja (fora de produção), não aparece', async () => {
    navegador(false);
    const { container } = render(<AvisosDoPedido slug="acai" paleta={PALETA} cor="#15803d" />);
    await waitFor(() => expect(mocks.chavePublica).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
