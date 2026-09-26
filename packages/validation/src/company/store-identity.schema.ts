import { z } from 'zod';

/**
 * A identidade visual da loja online, e o contraste das cores que ela escolhe.
 *
 * O contraste mora aqui, e não só no painel, porque o servidor recusa o que o
 * painel avisa: a tela e a API medem com a mesma régua e nunca discordam.
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

/** O fundo da página da loja. É contra ele que as duas cores são medidas. */
export type TemaDaLoja = 'CLARO' | 'ESCURO';

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
const FUNDOS: Record<TemaDaLoja, string> = {
  CLARO: '#ffffff',
  ESCURO: '#0f1115',
};

/**
 * O fundo em hexadecimal, e não em `rgb()`, para servir aos dois usos com um
 * valor só: pintar a prévia e alimentar `textoSobre` — que lê hex.
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

export interface ProblemaDeCor {
  campo: 'brandColor' | 'actionColor';
  contraste: number;
  minimo: number;
  mensagem: string;
}

/**
 * As cores que não se separam do fundo, com a frase que o painel mostra e que o
 * servidor devolve ao recusar. Cor fora do formato não entra aqui: é o formato
 * que a recusa.
 */
export function problemasDasCores(identidade: {
  theme: TemaDaLoja;
  brandColor: string;
  actionColor: string;
}): ProblemaDeCor[] {
  const tom = identidade.theme === 'ESCURO' ? 'claro' : 'escuro';
  const numero = (valor: number) => valor.toFixed(1).replace('.', ',');
  const medidas = [
    {
      campo: 'brandColor' as const,
      nome: 'cor da marca',
      uso: 'ela é usada no preço, como texto',
      contraste: contrasteComAPagina(identidade.brandColor, identidade.theme),
      minimo: MINIMO_PARA_TEXTO,
    },
    {
      campo: 'actionColor' as const,
      nome: 'cor de ação',
      uso: 'o botão quase some contra o fundo da página',
      contraste: contrasteComAPagina(identidade.actionColor, identidade.theme),
      minimo: MINIMO_PARA_BOTAO,
    },
  ];
  return medidas.flatMap(({ campo, nome, uso, contraste, minimo }) =>
    contraste !== null && contraste < minimo
      ? [
          {
            campo,
            contraste,
            minimo,
            mensagem:
              `A ${nome} não se separa do fundo: ${uso}. Contraste ${numero(contraste)}, ` +
              `e o mínimo é ${numero(minimo)}. Escolha um tom mais ${tom}.`,
          },
        ]
      : [],
  );
}

const corSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a cor no formato #1a2b3c.')
  .transform((cor) => cor.toLowerCase());

export const updateStoreIdentitySchema = z
  .object({
    theme: z.enum(['CLARO', 'ESCURO']),
    brandColor: corSchema,
    actionColor: corSchema,
  })
  .superRefine((identidade, ctx) => {
    for (const problema of problemasDasCores(identidade)) {
      ctx.addIssue({ code: 'custom', path: [problema.campo], message: problema.mensagem });
    }
  });

export type UpdateStoreIdentityPayload = z.infer<typeof updateStoreIdentitySchema>;
