import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComandaDaVenda } from '@/components/loja/comanda-da-venda';
import type { VendaDaLoja } from '@/lib/loja-mock';

const VENDA: VendaDaLoja = {
  numero: 1650,
  modalidade: 'ENTREGA',
  entregaPor: 'LOJA',
  etapa: 'EM_PREPARO',
  historico: [
    { etapa: 'NOVO', em: '2026-09-25T22:10:00.000Z' },
    { etapa: 'ACEITO', em: '2026-09-25T22:10:00.000Z' },
    { etapa: 'EM_PREPARO', em: '2026-09-25T22:12:00.000Z' },
  ],
  janela: null,
  minutosDePreparo: 20,
  minutosDeEntrega: 15,
  cancelamento: null,
  cliente: 'Beatriz Nunes',
  telefone: '(35) 99873-4410',
  // 36 + 22 de itens, mais 6 de taxa.
  total: 64,
  itens: [
    { nome: 'Açaí', quantidade: 2, tamanho: '500ml', escolhas: ['Morango', 'Granola'], total: 36 },
    { nome: 'X-Burger', quantidade: 1, tamanho: null, escolhas: [], total: 22 },
  ],
  pagamento: 'Dinheiro na entrega',
  trocoPara: 100,
  entrega: {
    rua: 'Rua Padre Júlio',
    numero: '58',
    complemento: 'Casa 2',
    bairro: 'Sagrada Família',
    cidade: 'Lajinha',
    estado: 'MG',
    cep: '36980-000',
    referencia: 'Portão azul',
  },
  cadastro: 'novo',
  observacao: 'Sem cebola no lanche',
  contaDoCliente: null,
};

function texto(): string {
  return screen.getByRole('article').textContent ?? '';
}

const COM_GRUPOS: VendaDaLoja = {
  ...VENDA,
  itens: [
    {
      nome: 'Açaí',
      quantidade: 1,
      tamanho: '500ml',
      escolhas: ['Leite condensado', 'Leite em pó', 'Morango', 'Banana', 'Chocolate', 'Granola'],
      grupos: [
        { grupo: 'Complementos', opcoes: ['Leite condensado', 'Leite em pó'] },
        { grupo: 'Frutas', opcoes: ['Morango', 'Banana'] },
        { grupo: 'Cobertura', opcoes: ['Chocolate'] },
        { grupo: 'Adicionais', opcoes: ['Granola'] },
      ],
      total: 22,
    },
  ],
};

describe('Comanda da venda', () => {
  it('mostra as escolhas por categoria, uma por linha, na ordem do cardápio', () => {
    render(
      <ComandaDaVenda
        venda={COM_GRUPOS}
        loja="Açaí do Centro"
        impressoEm="2026-09-25T22:15:00.000Z"
      />,
    );

    expect(texto()).toContain('1× Açaí — 500ml');
    const categorias = screen
      .getAllByText(/:$/)
      .map((elemento) => elemento.textContent)
      .filter((linha) => ['Complementos:', 'Frutas:', 'Cobertura:', 'Adicionais:'].includes(linha!));
    expect(categorias).toEqual(['Complementos:', 'Frutas:', 'Cobertura:', 'Adicionais:']);
    // Uma opção por linha, na ordem em que o cardápio as tem.
    const opcoes = ['Leite condensado', 'Leite em pó', 'Morango', 'Banana', 'Chocolate', 'Granola'];
    expect(
      screen
        .getAllByRole('listitem')
        .map((linha) => linha.textContent ?? '')
        .filter((linha) => opcoes.includes(linha)),
    ).toEqual(opcoes);
    // Em categorias, e não numa linha só.
    expect(texto()).not.toContain('Morango · Banana');
  });

  it('Adicionais ganha destaque, com ou sem acento e caixa, e só ele', () => {
    render(
      <ComandaDaVenda
        venda={{
          ...COM_GRUPOS,
          itens: [
            {
              ...COM_GRUPOS.itens[0]!,
              grupos: [
                { grupo: 'Frutas', opcoes: ['Morango'] },
                { grupo: 'ADICIONÁIS pagos', opcoes: ['Granola'] },
              ],
            },
          ],
        }}
        loja="Açaí do Centro"
        impressoEm="2026-09-25T22:15:00.000Z"
      />,
    );

    const destacado = screen.getByText('ADICIONÁIS pagos:').closest('div');
    const comum = screen.getByText('Frutas:').closest('div');
    expect(destacado?.className).toContain('adicionais');
    expect(comum?.className).not.toContain('adicionais');
  });

  it('leva o que a cozinha e quem entrega precisam', () => {
    render(
      <ComandaDaVenda venda={VENDA} loja="Açaí do Centro" impressoEm="2026-09-25T22:15:00.000Z" />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PEDIDO #1650');
    expect(texto()).toContain('Entrega · entregador da loja');
    expect(texto()).toContain('2× Açaí — 500ml');
    expect(texto()).toContain('Morango · Granola');
    expect(texto()).toContain('Sem cebola no lanche');
    expect(texto()).toContain('Rua Padre Júlio, 58 — Casa 2');
    expect(texto()).toContain('Referência: Portão azul');
  });

  it('diz quanto cobrar e quanto de troco levar', () => {
    render(
      <ComandaDaVenda venda={VENDA} loja="Açaí do Centro" impressoEm="2026-09-25T22:15:00.000Z" />,
    );

    expect(texto()).toContain('Taxa de entrega');
    expect(texto()).toMatch(/TOTAL\s*R\$\s*64,00/);
    expect(texto()).toMatch(/COBRAR R\$\s*64,00 NA ENTREGA/);
    expect(texto()).toMatch(/TROCO PARA R\$\s*100,00 — levar R\$\s*36,00/);
  });

  it('pago online: não cobrar', () => {
    render(
      <ComandaDaVenda
        venda={{
          ...VENDA,
          pagamento: 'Pix online',
          trocoPara: null,
          modalidade: 'RETIRADA',
          entregaPor: null,
          entrega: null,
        }}
        loja="Açaí do Centro"
        impressoEm="2026-09-25T22:15:00.000Z"
      />,
    );

    expect(texto()).toContain('JÁ PAGO — NÃO COBRAR');
    expect(texto()).toContain('Retirada na loja');
    expect(texto()).not.toContain('ENDEREÇO DE ENTREGA');
  });
});
