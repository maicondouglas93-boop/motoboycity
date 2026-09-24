import { describe, expect, it } from 'vitest';
import {
  FORMAS_DE_PAGAMENTO,
  LOJA_DE_EXEMPLO,
  formasOferecidas,
  resumoDosPagamentos,
  rotuloDoPagamento,
  type LojaDeExemplo,
} from '@/lib/loja-mock';

function lojaCom(mudancas: Partial<LojaDeExemplo>): LojaDeExemplo {
  return { ...LOJA_DE_EXEMPLO, ...mudancas };
}

describe('formasOferecidas', () => {
  /*
   * A regra que mais importa: sem conta Asaas, forma online não chega ao
   * cliente. O painel já impede marcá-la, mas a loja confere de novo — um
   * pedido pago por Pix online sem conta não teria para onde o dinheiro ir.
   */
  it('sem conta Asaas, esconde todas as formas online', () => {
    const loja = lojaCom({
      asaasConfigurado: false,
      pagamentos: ['PIX_ONLINE', 'CREDITO_ONLINE', 'DEBITO_ONLINE', 'DINHEIRO'],
    });
    expect(formasOferecidas(loja)).toEqual(['DINHEIRO']);
  });

  it('com conta Asaas, oferece o que a loja marcou, online e na entrega', () => {
    const loja = lojaCom({
      asaasConfigurado: true,
      pagamentos: ['PIX_ONLINE', 'DEBITO_MAQUININHA'],
    });
    expect(formasOferecidas(loja)).toEqual(['PIX_ONLINE', 'DEBITO_MAQUININHA']);
  });

  it('nunca oferece o que a loja não marcou', () => {
    const loja = lojaCom({ asaasConfigurado: true, pagamentos: ['DINHEIRO'] });
    expect(formasOferecidas(loja)).toEqual(['DINHEIRO']);
  });
});

describe('resumoDosPagamentos', () => {
  it('agrupa em online e na entrega, na ordem do catálogo', () => {
    expect(
      resumoDosPagamentos(['DINHEIRO', 'PIX_ONLINE', 'CREDITO_MAQUININHA', 'CREDITO_ONLINE']),
    ).toBe('Online: Pix, crédito · Na entrega: dinheiro, crédito');
  });

  it('omite o grupo que não tem forma nenhuma', () => {
    expect(resumoDosPagamentos(['DINHEIRO', 'PIX_MAQUININHA'])).toBe('Na entrega: dinheiro, Pix');
  });
});

describe('catálogo de formas', () => {
  it('são dois grupos: três online e quatro na entrega', () => {
    const online = FORMAS_DE_PAGAMENTO.filter((forma) => forma.grupo === 'ONLINE');
    const entrega = FORMAS_DE_PAGAMENTO.filter((forma) => forma.grupo === 'ENTREGA');
    expect(online.map((forma) => forma.valor)).toEqual([
      'PIX_ONLINE',
      'CREDITO_ONLINE',
      'DEBITO_ONLINE',
    ]);
    expect(entrega.map((forma) => forma.valor)).toEqual([
      'DINHEIRO',
      'PIX_MAQUININHA',
      'CREDITO_MAQUININHA',
      'DEBITO_MAQUININHA',
    ]);
  });

  it('toda forma tem rótulo para aparecer no pedido', () => {
    for (const forma of FORMAS_DE_PAGAMENTO) {
      expect(rotuloDoPagamento(forma.valor)).toBeTruthy();
    }
  });
});
