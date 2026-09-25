import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAS_DE_DESCANSO,
  conviteLiberado,
  escutarInstalacao,
  pedirInstalacao,
  reiniciarParaTeste,
} from './instalacao';

const DIA = 24 * 60 * 60 * 1000;

/** O evento que o Chrome dispara quando a página pode ser instalada. */
function eventoDoChrome(escolha: 'accepted' | 'dismissed') {
  const evento = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(evento, { prompt, userChoice: Promise.resolve({ outcome: escolha }) });
  return { evento, prompt };
}

describe('conviteLiberado', () => {
  const agora = new Date(2026, 8, 24).getTime();

  it('nunca dispensado: aparece', () => {
    expect(conviteLiberado(null, agora)).toBe(true);
  });

  it('dispensado ontem: descansa', () => {
    expect(conviteLiberado(agora - DIA, agora)).toBe(false);
  });

  it('volta exatamente quando o descanso termina, e não antes', () => {
    expect(conviteLiberado(agora - (DIAS_DE_DESCANSO * DIA - 1), agora)).toBe(false);
    expect(conviteLiberado(agora - DIAS_DE_DESCANSO * DIA, agora)).toBe(true);
  });
});

describe('pedirInstalacao', () => {
  beforeEach(() => {
    escutarInstalacao();
    reiniciarParaTeste();
  });

  it('sem o navegador ter oferecido, não há o que abrir', async () => {
    expect(await pedirInstalacao()).toBe('indisponivel');
  });

  /*
   * Se o evento não for interceptado, o Chrome mostra a faixa de instalação
   * dele logo na primeira visita — antes de o cliente ter motivo para querer o
   * app. É a interceptação que deixa o convite para depois do pedido.
   */
  it('segura a faixa do próprio navegador para usar na hora certa', () => {
    const { evento } = eventoDoChrome('accepted');
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });

  it('abre o diálogo do navegador e devolve o que o cliente escolheu', async () => {
    const { evento, prompt } = eventoDoChrome('accepted');
    window.dispatchEvent(evento);

    expect(await pedirInstalacao()).toBe('aceito');
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('recusa no diálogo volta como recusa', async () => {
    window.dispatchEvent(eventoDoChrome('dismissed').evento);
    expect(await pedirInstalacao()).toBe('recusado');
  });

  it('o evento só serve uma vez: depois de usado, não há outro', async () => {
    window.dispatchEvent(eventoDoChrome('dismissed').evento);
    await pedirInstalacao();
    expect(await pedirInstalacao()).toBe('indisponivel');
  });

  it('depois de instalado, deixa de oferecer', async () => {
    window.dispatchEvent(eventoDoChrome('accepted').evento);
    window.dispatchEvent(new Event('appinstalled'));
    expect(await pedirInstalacao()).toBe('indisponivel');
  });
});
