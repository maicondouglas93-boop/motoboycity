import { storeCheckoutSchema } from '@motoboycity/validation';

/**
 * O CEP do checkout: em branco (vale o da loja) ou completo. Um CEP pela metade
 * passava pela validação e só era recusado ao chamar o motoboy, com o pedido já
 * feito — a corrida não nascia, e a loja ficava com o aviso.
 */

function pedido(cep: string) {
  return {
    modalidade: 'ENTREGA',
    itens: [{ produtoId: 'p1', tamanhoId: null, escolhas: [], quantidade: 1 }],
    agendadoPara: null,
    cliente: { nome: 'Ana', telefone: '33999887766' },
    entrega: {
      rua: 'Rua A',
      numero: '10',
      complemento: null,
      bairroId: 'b1',
      cidade: 'Lajinha',
      estado: 'MG',
      cep,
      referencia: null,
    },
    pagamento: 'DINHEIRO',
    trocoPara: null,
    observacao: null,
    totalVisto: 20,
  };
}

describe('storeCheckoutSchema — CEP', () => {
  it.each(['', '36980000', '36980-000', '  36980-000  '])('aceita "%s"', (cep) => {
    expect(storeCheckoutSchema.safeParse(pedido(cep)).success).toBe(true);
  });

  it.each(['36980', '3698-0000', 'abcdefgh', '36980-00', '369800000'])('recusa "%s"', (cep) => {
    const resultado = storeCheckoutSchema.safeParse(pedido(cep));

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]).toMatchObject({
        path: ['entrega', 'cep'],
        message: 'CEP inválido. Use 8 dígitos.',
      });
    }
  });
});
