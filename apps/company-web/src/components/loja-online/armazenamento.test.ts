import { beforeEach, describe, expect, it } from 'vitest';
import type { EnderecoDaEntrega } from '@/lib/loja-mock';
import {
  ajustarQuantidade,
  clienteSalvo,
  guardarPedido,
  juntarNaSacola,
  type PedidoGuardado,
} from './armazenamento';

const SLUG = 'loja-de-teste';
const CONTA = 'usuario_1';

const CASA: EnderecoDaEntrega = {
  rua: 'Rua das Flores',
  numero: '45',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Lajinha',
  estado: 'MG',
  cep: '36980-000',
  referencia: null,
};

const VAZIO: EnderecoDaEntrega = {
  rua: '',
  numero: '',
  complemento: null,
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  referencia: null,
};

function pedido(mudancas: Partial<PedidoGuardado>): PedidoGuardado {
  return {
    numero: 1,
    criadoEm: '2026-09-24T12:00:00.000Z',
    itens: [],
    subtotal: 20,
    taxaDeEntrega: 0,
    total: 20,
    pagamento: 'Dinheiro na entrega',
    trocoPara: null,
    nome: 'Ana',
    telefone: '35999990000',
    entrega: CASA,
    minutosDePreparo: 20,
    observacao: null,
    retirarNaLoja: false,
    ...mudancas,
  };
}

describe('endereço salvo na conta', () => {
  beforeEach(() => window.localStorage.clear());

  it('pedido com entrega guarda o endereço para a próxima compra', () => {
    guardarPedido(SLUG, CONTA, pedido({}));
    expect(clienteSalvo(SLUG, CONTA)?.entrega).toEqual(CASA);
  });

  /*
   * A regressão que este teste segura: retirada não pergunta endereço, e uma
   * versão anterior gravava o formulário mesmo assim — a conta passava a ter um
   * "endereço salvo" em branco.
   */
  it('retirada não apaga o endereço da última entrega', () => {
    guardarPedido(SLUG, CONTA, pedido({ numero: 1 }));
    guardarPedido(SLUG, CONTA, pedido({ numero: 2, retirarNaLoja: true, entrega: VAZIO }));
    expect(clienteSalvo(SLUG, CONTA)?.entrega).toEqual(CASA);
  });

  it('retirada de quem nunca entregou não inventa endereço em branco', () => {
    guardarPedido(SLUG, CONTA, pedido({ retirarNaLoja: true, entrega: VAZIO }));
    expect(clienteSalvo(SLUG, CONTA)?.entrega).toBeNull();
  });

  it('retirada atualiza nome e telefone, que ela também pede', () => {
    guardarPedido(SLUG, CONTA, pedido({}));
    guardarPedido(
      SLUG,
      CONTA,
      pedido({ retirarNaLoja: true, entrega: VAZIO, nome: 'Ana Lima', telefone: '35988880000' }),
    );
    expect(clienteSalvo(SLUG, CONTA)).toMatchObject({ nome: 'Ana Lima', telefone: '35988880000' });
  });

  it('cada conta tem o seu endereço — no mesmo celular, uma não vê a da outra', () => {
    guardarPedido(SLUG, CONTA, pedido({}));
    expect(clienteSalvo(SLUG, 'outra_conta')).toBeNull();
  });
});

describe('regras da sacola', () => {
  const acai = {
    produtoId: 'p1',
    nome: 'Açaí',
    tamanho: '500ml',
    escolhas: ['Morango', 'Leite em pó'],
    quantidade: 1,
    unitario: 23,
  };

  it('a mesma configuração soma, mesmo com as escolhas em outra ordem', () => {
    const sacola = juntarNaSacola([acai], { ...acai, escolhas: ['Leite em pó', 'Morango'] });
    expect(sacola).toHaveLength(1);
    expect(sacola[0]?.quantidade).toBe(2);
  });

  it('outro tamanho é outra linha', () => {
    expect(juntarNaSacola([acai], { ...acai, tamanho: '300ml' })).toHaveLength(2);
  });

  it('chegando a zero, a linha sai', () => {
    expect(ajustarQuantidade([acai], 0, -1)).toEqual([]);
  });
});
