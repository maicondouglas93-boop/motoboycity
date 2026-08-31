export interface Pagina {
  /** A página realmente exibida — já grampeada ao total. */
  numero: number;
  totalPaginas: number;
  /** Índice do primeiro item, base zero, pronto para `slice`. */
  inicio: number;
  /** Índice do fim exclusivo, pronto para `slice`. */
  fim: number;
}

/**
 * Paginação no cliente, para listas que já chegaram inteiras.
 *
 * Gêmeo do arquivo de mesmo nome no `admin-web`: as duas telas de fatura
 * paginam do mesmo jeito e não existe pacote compartilhado de utilidades para
 * abrigar dez linhas. Corrigiu aqui, corrija lá.
 *
 * Existe separada da tela porque a parte que erra não é o JSX, são os limites:
 * a página que sobrou apontando para além do fim depois de a lista encolher, e
 * a última página quando o total não é múltiplo do tamanho.
 *
 * `numero` volta grampeado de propósito, em vez de a tela guardar um número
 * válido no estado. Uma lista que encolhe entre dois renders — a fatura
 * recarrega sozinha depois de marcar como paga ou cancelar — deixaria o estado
 * apontando para um pedaço que não existe mais, e a tabela apareceria vazia
 * como se a fatura não tivesse pedido nenhum.
 */
export function paginar(total: number, paginaPedida: number, tamanho: number): Pagina {
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho));
  // Também protege contra página 0 ou negativa, que dariam `inicio` negativo e
  // fariam o `slice` contar a partir do FIM da lista.
  const numero = Math.min(Math.max(1, paginaPedida), totalPaginas);
  const inicio = (numero - 1) * tamanho;
  return { numero, totalPaginas, inicio, fim: Math.min(inicio + tamanho, total) };
}
