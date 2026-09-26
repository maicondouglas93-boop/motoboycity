import type { FormaDePagamento, GrupoDePagamento } from '@motoboycity/types';

export type { FormaDePagamento, GrupoDePagamento };

/**
 * As formas de pagamento, em dois grupos: pagar agora, online, ou pagar quando
 * o pedido chegar. Os códigos (`FormaDePagamento`) são do contrato, em
 * `@motoboycity/types`; aqui ficam os textos que as telas mostram.
 *
 * Uma lista só, usada pelas Configurações (onde a loja marca o que aceita) e
 * pelo checkout (onde o cliente escolhe). Antes cada tela tinha a sua — uma com
 * códigos, a outra com textos soltos — e elas já não batiam.
 */
export interface DescricaoDaForma {
  valor: FormaDePagamento;
  grupo: GrupoDePagamento;
  /** Como aparece nas listas: "Crédito na maquininha". */
  titulo: string;
  /** Como entra no resumo do cabeçalho da loja: "crédito". */
  curto: string;
  detalhe: string;
}

export const GRUPOS_DE_PAGAMENTO: Record<GrupoDePagamento, { titulo: string; detalhe: string }> = {
  ONLINE: {
    titulo: 'Pagar agora, online',
    detalhe: 'Pelo Asaas, direto na conta da loja.',
  },
  ENTREGA: {
    titulo: 'Pagar na entrega',
    detalhe: 'Na hora em que o pedido chegar.',
  },
};

/*
 * Crédito e débito online passam pela página do próprio Asaas, e não por um
 * formulário nosso.
 *
 * O débito não tem escolha: a documentação do Asaas diz que os dados de cartão
 * de débito não podem ser enviados pela API — o cliente é levado à página da
 * cobrança (`invoiceUrl`) e escolhe débito lá. O crédito poderia ir pela API,
 * mas aí o número do cartão passaria pelo nosso sistema, e isso põe a loja no
 * escopo das regras de segurança de cartão. Pela página do Asaas, os dois
 * seguem o mesmo caminho e nenhum número de cartão toca o nosso código.
 *
 * Consequência a confirmar com o Asaas na integração: a cobrança de cartão
 * abre a mesma página para crédito e débito, e não verifiquei se a loja
 * consegue oferecer só um dos dois ali.
 */
export const FORMAS_DE_PAGAMENTO: DescricaoDaForma[] = [
  {
    valor: 'PIX_ONLINE',
    grupo: 'ONLINE',
    titulo: 'Pix',
    curto: 'Pix',
    detalhe: 'O QR Code aparece assim que o pedido é confirmado.',
  },
  {
    valor: 'CREDITO_ONLINE',
    grupo: 'ONLINE',
    titulo: 'Cartão de crédito',
    curto: 'crédito',
    detalhe: 'O cartão é digitado na página segura do Asaas, não aqui.',
  },
  {
    valor: 'DEBITO_ONLINE',
    grupo: 'ONLINE',
    titulo: 'Cartão de débito',
    curto: 'débito',
    detalhe: 'O cartão é digitado na página segura do Asaas, não aqui.',
  },
  {
    valor: 'DINHEIRO',
    grupo: 'ENTREGA',
    titulo: 'Dinheiro',
    curto: 'dinheiro',
    detalhe: 'O cliente informa para quanto precisa de troco.',
  },
  {
    valor: 'PIX_MAQUININHA',
    grupo: 'ENTREGA',
    titulo: 'Pix na maquininha',
    curto: 'Pix',
    detalhe: 'A maquininha gera o QR Code na porta e confirma o pagamento na hora.',
  },
  {
    valor: 'CREDITO_MAQUININHA',
    grupo: 'ENTREGA',
    titulo: 'Crédito na maquininha',
    curto: 'crédito',
    detalhe: 'Passado na maquininha, na entrega.',
  },
  {
    valor: 'DEBITO_MAQUININHA',
    grupo: 'ENTREGA',
    titulo: 'Débito na maquininha',
    curto: 'débito',
    detalhe: 'Passado na maquininha, na entrega.',
  },
];

/**
 * Como a forma aparece depois, no pedido: "Pix online", "Dinheiro na entrega",
 * "Crédito na maquininha".
 *
 * "Online", e não "pago online": nesta demonstração não há cobrança de verdade,
 * e mesmo na versão real o pedido pode existir antes de o pagamento cair.
 */
export function rotuloDoPagamento(valor: FormaDePagamento): string {
  const rotulos: Record<FormaDePagamento, string> = {
    PIX_ONLINE: 'Pix online',
    CREDITO_ONLINE: 'Crédito online',
    DEBITO_ONLINE: 'Débito online',
    DINHEIRO: 'Dinheiro na entrega',
    PIX_MAQUININHA: 'Pix na maquininha',
    CREDITO_MAQUININHA: 'Crédito na maquininha',
    DEBITO_MAQUININHA: 'Débito na maquininha',
  };
  return rotulos[valor];
}

export function descricaoDaForma(valor: FormaDePagamento): DescricaoDaForma {
  const descricao = FORMAS_DE_PAGAMENTO.find((forma) => forma.valor === valor);
  if (!descricao) throw new Error(`Forma de pagamento desconhecida: ${valor}`);
  return descricao;
}

/**
 * O resumo curto do cabeçalho da loja: "Online: Pix, crédito · Na entrega:
 * dinheiro, débito".
 *
 * Sete formas por extenso ocupariam três linhas antes do primeiro produto. O que
 * o cliente precisa decidir ali é só se o jeito dele de pagar está entre elas.
 */
export function resumoDosPagamentos(formas: FormaDePagamento[]): string {
  const partes: string[] = [];
  for (const grupo of ['ONLINE', 'ENTREGA'] as const) {
    const nomes = FORMAS_DE_PAGAMENTO.filter(
      (forma) => forma.grupo === grupo && formas.includes(forma.valor),
    ).map((forma) => forma.curto);
    if (nomes.length === 0) continue;
    partes.push(`${grupo === 'ONLINE' ? 'Online' : 'Na entrega'}: ${nomes.join(', ')}`);
  }
  return partes.join(' · ');
}
