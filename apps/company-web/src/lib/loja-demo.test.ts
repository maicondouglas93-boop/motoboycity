import { describe, expect, it } from 'vitest';
import {
  ajustarAgora,
  completarOperacao,
  lerOperacao,
  lerVendas,
  mudarEtapa,
  proximoNumeroDeVenda,
  registrarVenda,
  salvarOperacao,
} from './loja-demo';
import { OPERACAO_DE_EXEMPLO } from './loja-mock';
import { inicioDoPedido } from './loja-pedido';

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
