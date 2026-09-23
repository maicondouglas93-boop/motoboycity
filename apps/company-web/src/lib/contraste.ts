/**
 * Contraste das cores escolhidas pela loja.
 *
 * Existe porque a lojista escolhe pelo que gosta, não pelo que funciona.
 * Amarelo-claro sobre branco some, e ela não percebe — quem percebe é o cliente
 * que não achou o preço nem o botão.
 *
 * Duas medidas diferentes, porque as cores são usadas de dois jeitos:
 *
 * - A **cor da marca** vira TEXTO sobre o fundo da página (o preço em
 *   destaque). Texto exige 4.5:1.
 * - A **cor de ação** vira FUNDO de botão. O texto por cima é calculado aqui
 *   (preto ou branco, o que ler melhor), então ele nunca falha; o que pode
 *   falhar é o botão não se distinguir da página, e para isso a régua é 3:1.
 *
 * Uma versão anterior media "o melhor entre texto preto e branco sobre a cor".
 * Aquilo nunca acusava nada: com as duas opções disponíveis, toda cor passa de
 * 4.5. O aviso existia e jamais aparecia.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * O fundo da LOJA, e não o do painel — é lá que essas cores aparecem.
 *
 * Depende do tema que a loja escolheu: medir sempre contra branco daria
 * aprovação falsa para quem usa tema escuro, e reprovaria cor clara que ali
 * funciona bem.
 */
export type TemaDaLoja = 'CLARO' | 'ESCURO';

const FUNDOS: Record<TemaDaLoja, string> = {
  CLARO: '#ffffff',
  ESCURO: '#0f1115',
};

/**
 * O fundo em hexadecimal, e nao em `rgb()`, para servir aos dois usos com um
 * valor so: pintar a previa e alimentar `textoSobre` — que le hex.
 */
export function fundoDoTema(tema: TemaDaLoja): string {
  return FUNDOS[tema];
}

const PRETO: Rgb = { r: 0, g: 0, b: 0 };
const BRANCO: Rgb = { r: 255, g: 255, b: 255 };

export function lerHex(hex: string): Rgb | null {
  const limpo = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) return null;
  return {
    r: parseInt(limpo.slice(0, 2), 16),
    g: parseInt(limpo.slice(2, 4), 16),
    b: parseInt(limpo.slice(4, 6), 16),
  };
}

/** Luminância relativa, na definição da WCAG. */
function luminancia({ r, g, b }: Rgb): number {
  const canal = (valor: number) => {
    const escala = valor / 255;
    return escala <= 0.03928 ? escala / 12.92 : ((escala + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (escuro! + 0.05);
}

/** Preto ou branco sobre o fundo — o que tiver mais contraste. */
export function textoSobre(hex: string): '#000000' | '#ffffff' {
  const fundo = lerHex(hex);
  if (!fundo) return '#000000';
  return razao(fundo, PRETO) >= razao(fundo, BRANCO) ? '#000000' : '#ffffff';
}

/** Contraste da cor contra o fundo da loja, no tema escolhido. */
export function contrasteComAPagina(hex: string, tema: TemaDaLoja): number | null {
  const cor = lerHex(hex);
  const fundo = lerHex(FUNDOS[tema]);
  if (!cor || !fundo) return null;
  return razao(cor, fundo);
}

/** Texto pequeno sobre o fundo da página. */
export const MINIMO_PARA_TEXTO = 4.5;
/** Elemento de interface (botão, borda) contra o fundo da página. */
export const MINIMO_PARA_BOTAO = 3;
