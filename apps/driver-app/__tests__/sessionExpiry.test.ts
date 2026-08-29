import {
  notifySessionExpired,
  resetSessionExpiry,
  subscribeSessionExpired,
} from '../src/lib/sessionExpiry';
import { clearExpiredDriverSession } from '../src/lib/clearExpiredDriverSession';
import { disconnectDriverSocket } from '../src/lib/socket';

jest.mock('../src/lib/clearExpiredDriverSession', () => ({
  clearExpiredDriverSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/socket', () => ({
  disconnectDriverSocket: jest.fn(),
}));

const limparSessao = clearExpiredDriverSession as jest.MockedFunction<
  typeof clearExpiredDriverSession
>;
const desconectarSocket = disconnectDriverSocket as jest.MockedFunction<
  typeof disconnectDriverSocket
>;

/**
 * O encerramento de sessao existe porque um 401 no meio do expediente nao tinha
 * dono: o socket ficava morto, a tela de operacao dizia "Pedido indisponivel" e
 * nada dizia a unica coisa util — entre de novo.
 */
describe('encerramento de sessao', () => {
  beforeEach(() => {
    resetSessionExpiry();
    limparSessao.mockClear();
    desconectarSocket.mockClear();
  });

  it('limpa a credencial, derruba o socket e avisa quem estiver ouvindo', async () => {
    const ouvinte = jest.fn();
    const cancelar = subscribeSessionExpired(ouvinte);

    await notifySessionExpired();

    expect(desconectarSocket).toHaveBeenCalledTimes(1);
    expect(limparSessao).toHaveBeenCalledTimes(1);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    cancelar();
  });

  /**
   * Uma tela dispara varias requisicoes ao mesmo tempo e todas voltam 401
   * juntas. Sem a guarda, o motoboy receberia o mesmo alerta cinco vezes e a
   * limpeza rodaria em paralelo consigo mesma.
   */
  it('e idempotente enquanto a mesma expiracao esta em curso', async () => {
    const ouvinte = jest.fn();
    const cancelar = subscribeSessionExpired(ouvinte);

    await Promise.all([notifySessionExpired(), notifySessionExpired(), notifySessionExpired()]);

    expect(limparSessao).toHaveBeenCalledTimes(1);
    expect(ouvinte).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it('volta a disparar depois que o motoboy autentica de novo', async () => {
    const ouvinte = jest.fn();
    const cancelar = subscribeSessionExpired(ouvinte);

    await notifySessionExpired();
    resetSessionExpiry();
    await notifySessionExpired();

    expect(ouvinte).toHaveBeenCalledTimes(2);
    cancelar();
  });

  it('um ouvinte com problema nao impede os outros de saber', async () => {
    const quebrado = jest.fn(() => {
      throw new Error('falhou');
    });
    const saudavel = jest.fn();
    const cancelarQuebrado = subscribeSessionExpired(quebrado);
    const cancelarSaudavel = subscribeSessionExpired(saudavel);

    await expect(notifySessionExpired()).resolves.toBeUndefined();

    expect(saudavel).toHaveBeenCalledTimes(1);
    cancelarQuebrado();
    cancelarSaudavel();
  });

  it('para de avisar quem cancelou a inscricao', async () => {
    const ouvinte = jest.fn();
    subscribeSessionExpired(ouvinte)();

    await notifySessionExpired();

    expect(ouvinte).not.toHaveBeenCalled();
  });
});
