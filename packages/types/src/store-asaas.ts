/**
 * A conta Asaas da loja: por onde ela recebe as vendas pagas online, direto na
 * conta dela — a plataforma não toca no dinheiro da venda (decisão 3 do plano
 * da loja online).
 */

/** Onde a conta cobra: a de testes do Asaas ou a de verdade. */
export type AmbienteDoAsaas = 'SANDBOX' | 'PRODUCAO';

/** A conta, como o painel a mostra. A chave da API nunca sai do servidor. */
export type ContaAsaasDaLoja =
  | { conectada: false }
  | {
      conectada: true;
      ambiente: AmbienteDoAsaas;
      /** O nome da conta, como o Asaas devolveu: a loja confere que é a dela. */
      nome: string;
      email: string | null;
      /** Sem chave Pix ativa na conta, o Asaas não gera o QR code da cobrança. */
      temChavePix: boolean;
      /** ISO. */
      conectadaEm: string;
    };
