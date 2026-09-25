import { describe, expect, it } from 'vitest';
import { avisoParaOCliente, eventoDoCliente } from './loja-avisos';
import {
  TransicaoInvalida,
  acaoParaAvancar,
  avancar,
  caminhoDoPedido,
  esperandoAHora,
  inicioDoPedido,
  inicioDoPreparo,
  podeCancelar,
  prazoDoAceite,
  previsaoParaOCliente,
  type AndamentoDoPedido,
} from './loja-pedido';

const em = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

function pedido(mudancas: Partial<AndamentoDoPedido> = {}): AndamentoDoPedido {
  return {
    numero: 1607,
    modalidade: 'ENTREGA',
    ...inicioDoPedido('MANUAL', em('2026-09-22T19:00')),
    janela: null,
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    cancelamento: null,
    ...mudancas,
  };
}

describe('o caminho do pedido', () => {
  it('a entrega passa pela saída do motoboy; a retirada não', () => {
    expect(caminhoDoPedido('ENTREGA')).toEqual([
      'NOVO',
      'ACEITO',
      'EM_PREPARO',
      'PRONTO',
      'SAIU_PARA_ENTREGA',
      'ENTREGUE',
    ]);
    expect(caminhoDoPedido('RETIRADA')).not.toContain('SAIU_PARA_ENTREGA');
  });

  it('no aceite automático o pedido nasce aceito, com as duas marcas no histórico', () => {
    const inicio = inicioDoPedido('AUTOMATICO', em('2026-09-22T19:00'));
    expect(inicio.etapa).toBe('ACEITO');
    expect(inicio.historico.map((passo) => passo.etapa)).toEqual(['NOVO', 'ACEITO']);
  });

  it('no aceite manual o pedido espera, como novo', () => {
    expect(inicioDoPedido('MANUAL', em('2026-09-22T19:00')).etapa).toBe('NOVO');
  });

  it('anda uma etapa por vez e guarda a hora de cada uma', () => {
    const aceito = avancar(pedido(), 'ACEITO', em('2026-09-22T19:02'));
    const preparo = avancar(aceito, 'EM_PREPARO', em('2026-09-22T19:05'));
    expect(preparo.etapa).toBe('EM_PREPARO');
    expect(preparo.historico.at(-1)).toEqual({
      etapa: 'EM_PREPARO',
      em: em('2026-09-22T19:05').toISOString(),
    });
  });

  it('não pula etapa: de novo direto para pronto seria esconder do cliente o aceite', () => {
    expect(() => avancar(pedido(), 'PRONTO', em('2026-09-22T19:02'))).toThrow(TransicaoInvalida);
  });

  it('retirada vai de pronto a retirado, sem saída para entrega', () => {
    const pronto = pedido({ modalidade: 'RETIRADA', etapa: 'PRONTO' });
    expect(() => avancar(pronto, 'SAIU_PARA_ENTREGA', em('2026-09-22T19:30'))).toThrow();
    expect(avancar(pronto, 'ENTREGUE', em('2026-09-22T19:30')).etapa).toBe('ENTREGUE');
  });

  it('pedir a etapa em que o pedido já está não é erro, nem duplica o histórico', () => {
    const aceito = avancar(pedido(), 'ACEITO', em('2026-09-22T19:02'));
    expect(avancar(aceito, 'ACEITO', em('2026-09-22T19:03'))).toBe(aceito);
  });
});

describe('cancelar', () => {
  it('na entrega, só até ficar pronto: depois o motoboy já foi chamado', () => {
    expect(podeCancelar('ENTREGA', 'EM_PREPARO')).toBe(true);
    expect(podeCancelar('ENTREGA', 'PRONTO')).toBe(false);
    expect(podeCancelar('ENTREGA', 'SAIU_PARA_ENTREGA')).toBe(false);
  });

  it('na retirada, até o cliente buscar', () => {
    expect(podeCancelar('RETIRADA', 'PRONTO')).toBe(true);
    expect(podeCancelar('RETIRADA', 'ENTREGUE')).toBe(false);
  });

  it('guarda o motivo e quem cancelou', () => {
    const cancelado = avancar(pedido(), 'CANCELADO', em('2026-09-22T19:03'), {
      motivo: 'Item em falta',
      por: 'LOJA',
    });
    expect(cancelado.cancelamento).toEqual({ motivo: 'Item em falta', por: 'LOJA' });
    expect(() => avancar(cancelado, 'ACEITO', em('2026-09-22T19:04'))).toThrow();
  });

  it('recusa cancelar o que já saiu com o motoboy', () => {
    const saiu = pedido({ etapa: 'SAIU_PARA_ENTREGA' });
    expect(() => avancar(saiu, 'CANCELADO', em('2026-09-22T19:40'))).toThrow(TransicaoInvalida);
  });
});

describe('pedido agendado', () => {
  const agendado = pedido({
    etapa: 'ACEITO',
    janela: {
      inicio: em('2026-09-23T12:00').toISOString(),
      fim: em('2026-09-23T12:30').toISOString(),
    },
  });

  it('a cozinha começa o preparo mais o caminho antes da janela', () => {
    expect(inicioDoPreparo(agendado)).toEqual(em('2026-09-23T11:25'));
    expect(inicioDoPreparo({ ...agendado, modalidade: 'RETIRADA' })).toEqual(
      em('2026-09-23T11:40'),
    );
  });

  it('fica fora da fila de agora até a hora de começar', () => {
    expect(esperandoAHora(agendado, em('2026-09-22T19:00'))).toBe(true);
    expect(esperandoAHora(agendado, em('2026-09-23T11:25'))).toBe(false);
  });

  it('agendado e ainda novo continua na fila: alguém precisa aceitar hoje', () => {
    expect(esperandoAHora({ ...agendado, etapa: 'NOVO' }, em('2026-09-22T19:00'))).toBe(false);
  });
});

describe('o que o cliente lê', () => {
  const agora = em('2026-09-22T19:10');

  it('antes de a loja aceitar, não promete horário', () => {
    expect(previsaoParaOCliente(pedido(), agora)).toBe(
      'A previsão aparece quando a loja confirmar',
    );
  });

  it('entrega: uma janela, contada a partir do aceite', () => {
    const aceito = avancar(pedido(), 'ACEITO', em('2026-09-22T19:05'));
    // 19:05 + 20 de preparo + 15 de caminho, e uma folga de 15 na ponta.
    expect(previsaoParaOCliente(aceito, agora)).toBe('Chega entre 19:40 e 19:55');
  });

  it('retirada: a partir de quando dá para buscar', () => {
    const aceito = avancar(pedido({ modalidade: 'RETIRADA' }), 'ACEITO', em('2026-09-22T19:05'));
    expect(previsaoParaOCliente(aceito, agora)).toBe('Pronto para retirar a partir de 19:25');
  });

  it('agendado: o dia e a janela escolhidos', () => {
    const agendado = pedido({
      etapa: 'ACEITO',
      janela: {
        inicio: em('2026-09-25T12:00').toISOString(),
        fim: em('2026-09-25T12:30').toISOString(),
      },
    });
    expect(previsaoParaOCliente(agendado, agora)).toBe(
      'Agendado para sexta, 25/09, entre 12:00 e 12:30',
    );
  });

  it('cancelado diz o motivo', () => {
    const cancelado = avancar(pedido(), 'CANCELADO', agora, {
      motivo: 'Item em falta',
      por: 'LOJA',
    });
    expect(previsaoParaOCliente(cancelado, agora)).toBe('Cancelado · Item em falta');
  });

  it('cada etapa tem o seu aviso, e "pronto" só avisa na retirada', () => {
    expect(eventoDoCliente('ENTREGA', 'PRONTO')).toBeNull();
    expect(eventoDoCliente('RETIRADA', 'PRONTO')).toBe('PRONTO_PARA_RETIRAR');
    expect(avisoParaOCliente('SAIU_PARA_ENTREGA', 1607, 'ENTREGA')).toBe(
      'Seu pedido #1607 saiu para entrega.',
    );
    expect(avisoParaOCliente('CANCELADO', 1607, 'ENTREGA', 'Item em falta')).toBe(
      'Seu pedido #1607 foi cancelado: Item em falta.',
    );
  });

  it('o botão diz a ação, e muda na retirada', () => {
    expect(acaoParaAvancar('ENTREGA', 'PRONTO')).toBe('Motoboy coletou');
    expect(acaoParaAvancar('RETIRADA', 'PRONTO')).toBe('Cliente retirou');
    expect(acaoParaAvancar('ENTREGA', 'ENTREGUE')).toBeNull();
  });
});

describe('prazo do aceite manual', () => {
  it('pedido para agora: conta do recebimento', () => {
    // O pedido de exemplo chega às 19:00, esperando aceite.
    expect(prazoDoAceite(pedido(), 10)).toEqual(em('2026-09-22T19:10'));
  });

  /*
   * O caso que um prazo ingênuo erraria: o pedido feito à noite para o almoço
   * de amanhã cairia dez minutos depois, com a loja fechada e ninguém no
   * painel. Ele só vira problema quando a cozinha já devia estar trabalhando.
   */
  it('agendado: espera até a hora de a cozinha começar', () => {
    const agendado = pedido({
      janela: {
        inicio: em('2026-09-23T12:00').toISOString(),
        fim: em('2026-09-23T12:30').toISOString(),
      },
    });
    expect(prazoDoAceite(agendado, 10)).toEqual(em('2026-09-23T11:25'));
  });

  it('sem prazo escolhido, ou depois de aceito, não há prazo', () => {
    expect(prazoDoAceite(pedido(), null)).toBeNull();
    expect(prazoDoAceite(avancar(pedido(), 'ACEITO', em('2026-09-22T19:02')), 10)).toBeNull();
  });
});
