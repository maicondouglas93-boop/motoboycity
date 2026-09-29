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
  /** Separadores decorativos: não pedem contraste. */
  linha: string;
  /** O contorno de um campo ou de uma opção: 3:1 sobre o fundo, para o
   *  controle ser reconhecido (WCAG 1.4.11). Sai do texto misturado ao fundo,
   *  e por isso acompanha o tema escolhido pela loja. */
  contorno: string;
  /** Mensagem de erro junto do campo. */
  erro: string;
}

export function paletaDoTema(tema: TemaDaLoja): Paleta {
  if (tema === 'ESCURO') {
    return {
      fundo: fundoDoTema('ESCURO'),
      superficie: '#171a20',
      texto: '#f2f3f5',
      suave: '#9aa1ac',
      linha: '#262a33',
      contorno: 'color-mix(in srgb, #f2f3f5 50%, ' + fundoDoTema('ESCURO') + ')',
      erro: '#fda29b',
    };
  }
  return {
    fundo: fundoDoTema('CLARO'),
    superficie: '#f6f6f7',
    texto: '#17181c',
    suave: '#6b7280',
    linha: '#e6e6e9',
    contorno: 'color-mix(in srgb, #17181c 50%, ' + fundoDoTema('CLARO') + ')',
    erro: '#b42318',
  };
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export { textoSobre };
