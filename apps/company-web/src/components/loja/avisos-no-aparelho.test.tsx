import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvisosNoAparelho } from '@/components/loja/avisos-no-aparelho';
import { chaveEmBytes } from '@/lib/avisos-push';

/**
 * Os avisos com o painel fechado, neste aparelho: o que o cartão mostra em cada
 * situação, e o que ele manda para a API ao ligar e ao desligar. O navegador
 * (service worker, push, permissão) é simulado.
 */

const mocks = vi.hoisted(() => ({
  chavePublica: vi.fn(),
  inscreverAvisos: vi.fn(),
  cancelarAvisos: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  webPushApi: { chavePublica: mocks.chavePublica },
  companyStoreOrdersApi: {
    inscreverAvisos: mocks.inscreverAvisos,
    cancelarAvisos: mocks.cancelarAvisos,
  },
}));

const ENDERECO = 'https://fcm.googleapis.com/fcm/send/aparelho-1';

/** Um navegador com push: a inscrição existe depois do `subscribe`. */
function navegadorComPush(inscritoAntes = false) {
  let inscricao: {
    endpoint: string;
    toJSON: () => unknown;
    unsubscribe: ReturnType<typeof vi.fn>;
  } | null = null;
  const criar = () => ({
    endpoint: ENDERECO,
    toJSON: () => ({ endpoint: ENDERECO, keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  });
  if (inscritoAntes) inscricao = criar();
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(inscricao)),
    subscribe: vi.fn(() => {
      inscricao = criar();
      return Promise.resolve(inscricao);
    }),
  };
  const registro = { active: {}, pushManager };
  const serviceWorker = {
    getRegistration: vi.fn(() => Promise.resolve(inscritoAntes ? registro : undefined)),
    register: vi.fn(() => Promise.resolve(registro)),
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
  return { serviceWorker, pushManager };
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.chavePublica.mockResolvedValue('AQID-_8');
  mocks.inscreverAvisos.mockResolvedValue(undefined);
  mocks.cancelarAvisos.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('Avisos com o painel fechado', () => {
  it('liga: registra o worker só em /loja/, inscreve e manda o endereço para a API', async () => {
    const { serviceWorker, pushManager } = navegadorComPush();
    render(<AvisosNoAparelho />);

    fireEvent.click(await screen.findByRole('button', { name: /Avisar neste aparelho/ }));

    await waitFor(() =>
      expect(mocks.inscreverAvisos).toHaveBeenCalledWith('token', {
        endpoint: ENDERECO,
        keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
      }),
    );
    expect(serviceWorker.register).toHaveBeenCalledWith('/loja/avisos-sw.js', { scope: '/loja/' });
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(
      await screen.findByText('Este aparelho avisa mesmo com o painel fechado.'),
    ).toBeInTheDocument();
  });

  it('desliga: tira na API e no navegador', async () => {
    navegadorComPush(true);
    render(<AvisosNoAparelho />);

    fireEvent.click(await screen.findByRole('button', { name: 'Parar de avisar neste aparelho' }));

    await waitFor(() => expect(mocks.cancelarAvisos).toHaveBeenCalledWith('token', ENDERECO));
    expect(
      await screen.findByText('Este aparelho só avisa com o painel aberto.'),
    ).toBeInTheDocument();
  });

  it('sem as chaves no servidor, diz isso e não oferece botão', async () => {
    navegadorComPush();
    mocks.chavePublica.mockResolvedValue(null);
    render(<AvisosNoAparelho />);

    expect(await screen.findByText(/ainda não foram ligados no servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('navegador sem push diz que não recebe', async () => {
    render(<AvisosNoAparelho />);
    expect(
      await screen.findByText(/Este navegador não recebe avisos com a página fechada/),
    ).toBeInTheDocument();
  });
});

describe('a chave pública', () => {
  it('base64url vira os bytes que o navegador quer', () => {
    expect(Array.from(chaveEmBytes('AQID-_8'))).toEqual([1, 2, 3, 251, 255]);
  });
});
