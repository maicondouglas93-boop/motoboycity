import { describe, expect, it } from 'vitest';
import {
  ajustarAgora,
  cancelarVencidos,
  completarOperacao,
  lerOperacao,
  lerVendas,
  mudarEtapa,
  proximoNumeroDeVenda,
  registrarVenda,
  salvarOperacao,
} from './loja-demo';
import { OPERACAO_DE_EXEMPLO } from './loja-mock';
import { MOTIVO_DO_PRAZO, inicioDoPedido } from './loja-pedido';

/**
 * O armazenamento da demonstração faz as vezes do servidor. Dois erros dele
 * passariam despercebidos na tela: salvar uma tela apagar o que outra aba mudou
 * — a pausa, principalmente —, e dois toques na mesma ação estragarem o
 * histórico do pedido.
 */

describe('configuração da loja', () => {
  it('completa com o exemplo o que uma versão anterior não salvou', () => {
    const operacao = completarOperacao({
      entrega: { ativa: false, pedidoMinimo: null, agendamento: false },
    });
    expect(operacao.entrega.ativa).toBe(false);
    expect(operacao.retirada).toEqual(OPERACAO_DE_EXEMPLO.retirada);
    expect(operacao.notificacoes.cliente.CANCELADO).toBe(true);
  });

  it('salvar uma tela não desfaz a pausa feita em outra', () => {
    const pausa = {
      estado: 'PAUSADA' as const,
      desde: '2026-09-22T15:00:00.000Z',
      ate: '2026-09-22T15:30:00.000Z',
    };
    ajustarAgora(pausa);
    salvarOperacao({ notificacoes: { ...OPERACAO_DE_EXEMPLO.notificacoes, repetirSom: false } });

    const salva = lerOperacao();
    expect(salva.funcionamento.ajuste).toEqual(pausa);
    expect(salva.notificacoes.repetirSom).toBe(false);
  });
});

describe('vendas', () => {
  it('anda uma etapa, e o mesmo pedido de novo não muda nada', () => {
    const numero = lerVendas().find((venda) => venda.etapa === 'ACEITO' && !venda.janela)?.numero;
    expect(numero).toBeDefined();

    expect(mudarEtapa(numero!, 'EM_PREPARO')).toBe(true);
    const depois = lerVendas().find((venda) => venda.numero === numero);
    expect(depois?.etapa).toBe('EM_PREPARO');

    // A segunda aba tocando o mesmo botão: nada muda, e o histórico não duplica.
    expect(mudarEtapa(numero!, 'EM_PREPARO')).toBe(false);
    expect(lerVendas().find((venda) => venda.numero === numero)?.historico).toEqual(
      depois?.historico,
    );
  });

  it('recusa pular etapa, sem mexer no pedido', () => {
    const numero = lerVendas().find((venda) => venda.etapa === 'ACEITO' && !venda.janela)?.numero;
    const antes = lerVendas();
    expect(mudarEtapa(numero!, 'ENTREGUE')).toBe(false);
    expect(lerVendas()).toEqual(antes);
  });

  it('aceitar com outro tempo de preparo guarda o tempo daquele pedido', () => {
    const numero = proximoNumeroDeVenda();
    registrarVenda({
      ...lerVendas()[0]!,
      numero,
      janela: null,
      contaDoCliente: 'conta_de_teste',
      ...inicioDoPedido('MANUAL', new Date()),
    });

    expect(mudarEtapa(numero, 'ACEITO', { minutosDePreparo: 40 })).toBe(true);
    expect(lerVendas().find((venda) => venda.numero === numero)).toMatchObject({
      etapa: 'ACEITO',
      minutosDePreparo: 40,
    });
  });

  it('o próximo número passa de todos os que existem', () => {
    const maior = Math.max(...lerVendas().map((venda) => venda.numero));
    expect(proximoNumeroDeVenda()).toBeGreaterThan(Math.max(maior, 1600));
  });
});

describe('prazo do aceite', () => {
  const as = (hora: string) => new Date(`2026-09-22T${hora}:00-03:00`);

  /** Um pedido esperando aceite, recebido às 19:00. */
  function pedidoNovo(): number {
    const numero = proximoNumeroDeVenda();
    registrarVenda({
      ...lerVendas()[0]!,
      numero,
      janela: null,
      cancelamento: null,
      contaDoCliente: 'conta_de_teste',
      ...inicioDoPedido('MANUAL', as('19:00')),
    });
    return numero;
  }

  it('cancela o pedido vencido, com a hora do prazo, e uma vez só', () => {
    salvarOperacao({
      recebimento: { ...OPERACAO_DE_EXEMPLO.recebimento, modo: 'MANUAL', prazoDoAceiteMin: 10 },
    });
    const numero = pedidoNovo();

    expect(cancelarVencidos(as('19:09'))).toBe(0);
    expect(cancelarVencidos(as('19:30'))).toBe(1);

    const venda = lerVendas().find((item) => item.numero === numero);
    expect(venda).toMatchObject({
      etapa: 'CANCELADO',
      cancelamento: { motivo: MOTIVO_DO_PRAZO, por: 'SISTEMA' },
    });
    // A hora é a do prazo, e não a de quando a página percebeu.
    expect(venda?.historico.at(-1)?.em).toBe(as('19:10').toISOString());

    // A outra aba rodando junto não cancela de novo.
    expect(cancelarVencidos(as('19:31'))).toBe(0);
  });

  it('com o prazo desligado, ninguém cancela sozinho', () => {
    salvarOperacao({
      recebimento: { ...OPERACAO_DE_EXEMPLO.recebimento, modo: 'MANUAL', prazoDoAceiteMin: null },
    });
    const numero = pedidoNovo();
    expect(cancelarVencidos(as('23:59'))).toBe(0);
    expect(lerVendas().find((item) => item.numero === numero)?.etapa).toBe('NOVO');
  });
});
