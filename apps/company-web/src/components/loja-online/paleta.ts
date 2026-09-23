import { fundoDoTema, textoSobre, type TemaDaLoja } from '@/lib/contraste';

/**
 * As cores da página da loja, derivadas do tema que a empresa escolheu.
 *
 * A loja NÃO herda os tokens do painel. Ela é a página do cliente, com a
 * identidade daquela loja — usar `--background` e `--foreground` do painel
 * faria toda loja parecer a mesma, que é justamente o que a escolha de cores
 * existe para evitar.
 *
 * Só dois tons de texto, e não uma escala de cinzas: com mais níveis, a
 * hierarquia vira decoração e nada fica claramente mais importante.
 */
export interface Paleta {
  fundo: string;
  /** Faixas e blocos que precisam se separar do fundo sem virar cartão. */
  superficie: string;
  texto: string;
  suave: string;
  linha: string;
}

export function paletaDoTema(tema: TemaDaLoja): Paleta {
  if (tema === 'ESCURO') {
    return {
      fundo: fundoDoTema('ESCURO'),
      superficie: '#171a20',
      texto: '#f2f3f5',
      suave: '#9aa1ac',
      linha: '#262a33',
    };
  }
  return {
    fundo: fundoDoTema('CLARO'),
    superficie: '#f6f6f7',
    texto: '#17181c',
    suave: '#6b7280',
    linha: '#e6e6e9',
  };
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export { textoSobre };
