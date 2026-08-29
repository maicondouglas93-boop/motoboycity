import { clearExpiredDriverSession } from './clearExpiredDriverSession';
import { disconnectDriverSocket } from './socket';

/**
 * Uma unica reacao para "a credencial deixou de valer", em qualquer lugar do
 * aplicativo.
 *
 * Antes disso, um 401 no meio do expediente nao tinha dono: o bootstrap tratava
 * (so na abertura fria), a outbox parava a fila, a tela de operacao mostrava
 * "Pedido indisponivel" — e o socket, derrubado pelo servidor, ficava morto para
 * sempre. O motoboy via "Ativo" ligado, nenhum pedido chegando, e nada dizia a
 * unica coisa util: entre de novo.
 *
 * O caso real que produz isso e o admin redefinir a senha do motoboy, que revoga
 * o JWT pela impressao do hash. Tambem acontece uma vez para a frota inteira a
 * cada mudanca dessa impressao.
 */

type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();
let expiring: Promise<void> | null = null;

export function subscribeSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Derruba a sessao local e avisa quem estiver ouvindo.
 *
 * Idempotente por construcao: uma tela costuma disparar varias requisicoes ao
 * mesmo tempo, e todas voltam 401 juntas. Sem esta guarda, o motoboy receberia
 * o mesmo alerta cinco vezes e a limpeza rodaria em paralelo consigo mesma.
 */
export function notifySessionExpired(): Promise<void> {
  if (expiring) return expiring;

  expiring = (async () => {
    // O socket morre primeiro: ele ja esta derrubado pelo servidor e nao deve
    // tentar reconectar com uma credencial que acabou de ser descartada.
    disconnectDriverSocket();
    await clearExpiredDriverSession().catch(() => undefined);
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Um ouvinte com problema nao pode impedir os outros de saber.
      }
    }
  })();

  return expiring;
}

/** Libera uma nova deteccao depois que o motoboy autentica outra vez. */
export function resetSessionExpiry(): void {
  expiring = null;
}
