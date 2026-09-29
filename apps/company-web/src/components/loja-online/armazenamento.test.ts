import { beforeEach, describe, expect, it } from 'vitest';
import type { EnderecoDaEntrega } from '@/lib/loja-mock';
import {
  ajustarQuantidade,
  apelidoSugerido,
  clienteSalvo,
  comEnderecoDoPedido,
  enderecosDaConta,
  guardarCliente,
  guardarEnderecos,
  guardarPedido,
  juntarNaSacola,
  MAX_ENDERECOS,
  removerEndereco,
  type EnderecoSalvo,
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

describe('vários endereços na conta', () => {
  const TRABALHO: EnderecoDaEntrega = {
    ...CASA,
    rua: 'Av. Brasil',
    numero: '900',
    bairro: 'Industrial',
  };
  const salvo = (id: string, apelido: string, endereco: EnderecoDaEntrega): EnderecoSalvo => ({
    id,
    apelido,
    endereco,
  });
  beforeEach(() => window.localStorage.clear());

  it('quem guardou um endereço antes da lista tem "Casa"; quem nunca guardou, nenhum', () => {
    guardarPedido(SLUG, CONTA, pedido({}));
    const conta = clienteSalvo(SLUG, CONTA);

    expect(conta?.enderecos).toBeUndefined();
    expect(enderecosDaConta(conta)).toEqual([{ id: 'primeiro', apelido: 'Casa', endereco: CASA }]);
    expect(enderecosDaConta(null)).toEqual([]);
    guardarPedido(SLUG, 'outra', pedido({ retirarNaLoja: true, entrega: VAZIO }));
    expect(enderecosDaConta(clienteSalvo(SLUG, 'outra'))).toEqual([]);
  });

  it('endereço novo, com "guardar" marcado, entra no fim da lista', () => {
    const atuais = [salvo('a', 'Casa', CASA)];
    const depois = comEnderecoDoPedido(atuais, {
      escolhidoId: null,
      endereco: TRABALHO,
      apelido: '  Trabalho ',
      salvar: true,
    });

    expect(depois).toHaveLength(2);
    expect(depois[1]).toMatchObject({ apelido: 'Trabalho', endereco: TRABALHO });
    expect(depois[1]!.id).toBeTruthy();
    expect(depois[1]!.id).not.toBe('a');
  });

  it('sem "guardar", repetido ou com a lista cheia, a lista não muda', () => {
    const atuais = [salvo('a', 'Casa', CASA)];
    const novo = { escolhidoId: null, endereco: TRABALHO, apelido: 'Trabalho', salvar: true };

    expect(comEnderecoDoPedido(atuais, { ...novo, salvar: false })).toBe(atuais);
    // A mesma rua, número, complemento e bairro, ainda que escrita de outro jeito.
    expect(
      comEnderecoDoPedido(atuais, {
        ...novo,
        endereco: { ...CASA, rua: ' rua das flores ', cep: '' },
      }),
    ).toBe(atuais);
    const cheia = Array.from({ length: MAX_ENDERECOS }, (_, i) =>
      salvo(String(i), `E${i}`, { ...CASA, numero: String(i) }),
    );
    expect(comEnderecoDoPedido(cheia, novo)).toBe(cheia);
  });

  it('endereço escolhido da lista guarda as edições e o novo apelido, e só nele', () => {
    const atuais = [salvo('a', 'Casa', CASA), salvo('b', 'Trabalho', TRABALHO)];
    const depois = comEnderecoDoPedido(atuais, {
      escolhidoId: 'b',
      endereco: { ...TRABALHO, complemento: 'Sala 3' },
      apelido: 'Escritório',
      salvar: false,
    });

    expect(depois[0]).toBe(atuais[0]);
    expect(depois[1]).toMatchObject({
      id: 'b',
      apelido: 'Escritório',
      endereco: { complemento: 'Sala 3' },
    });
  });

  it('a lista sobrevive ao próximo pedido, que só guarda nome, telefone e o último usado', () => {
    guardarPedido(SLUG, CONTA, pedido({}));
    guardarEnderecos(SLUG, CONTA, [salvo('a', 'Casa', CASA), salvo('b', 'Trabalho', TRABALHO)]);

    guardarPedido(SLUG, CONTA, pedido({ numero: 2, entrega: TRABALHO }));

    const conta = clienteSalvo(SLUG, CONTA);
    expect(conta?.entrega).toEqual(TRABALHO);
    expect(conta?.enderecos?.map((item) => item.apelido)).toEqual(['Casa', 'Trabalho']);
    // Uma retirada no meio também não a leva embora.
    guardarCliente(SLUG, CONTA, { nome: 'Ana', telefone: '35999990000', entrega: null });
    expect(clienteSalvo(SLUG, CONTA)?.enderecos).toHaveLength(2);
  });

  it('apagar tira da lista; se era o último usado, ele não volta preenchido no formulário', () => {
    guardarPedido(SLUG, CONTA, pedido({ entrega: TRABALHO }));
    guardarEnderecos(SLUG, CONTA, [salvo('a', 'Casa', CASA), salvo('b', 'Trabalho', TRABALHO)]);

    const restantes = removerEndereco(SLUG, CONTA, 'b');

    expect(restantes.map((item) => item.id)).toEqual(['a']);
    expect(clienteSalvo(SLUG, CONTA)?.entrega).toBeNull();
    expect(clienteSalvo(SLUG, CONTA)?.enderecos).toHaveLength(1);
    // Apagar o único que restou deixa a lista vazia, e não volta "Casa" do nada.
    removerEndereco(SLUG, CONTA, 'a');
    expect(enderecosDaConta(clienteSalvo(SLUG, CONTA))).toEqual([]);
  });

  it('apagar o endereço de uma conta que ainda usa o formato antigo funciona', () => {
    guardarPedido(SLUG, CONTA, pedido({}));

    expect(removerEndereco(SLUG, CONTA, 'primeiro')).toEqual([]);
    expect(enderecosDaConta(clienteSalvo(SLUG, CONTA))).toEqual([]);
  });

  it('o apelido sugerido é Casa, depois Trabalho, depois nada', () => {
    expect(apelidoSugerido([])).toBe('Casa');
    expect(apelidoSugerido([salvo('a', ' casa ', CASA)])).toBe('Trabalho');
    expect(apelidoSugerido([salvo('a', 'Casa', CASA), salvo('b', 'Trabalho', TRABALHO)])).toBe('');
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
