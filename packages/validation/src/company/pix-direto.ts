import type { TipoDeChavePix } from '@motoboycity/types';
import { z } from 'zod';
import { hasValidCpfCheckDigits } from './company-customer.schema';

/**
 * O Pix direto: a loja recebe na chave dela, sem gateway. O cliente paga por um
 * QR "estático com valor" — o padrão BR Code do Banco Central — e manda o
 * comprovante pelo WhatsApp; ninguém confirma o pagamento sozinho.
 *
 * Tudo aqui é função pura, sem globais do ambiente: este pacote também roda no
 * navegador e no deploy, e é lá que um `Buffer` ou um `URL` a mais quebra.
 */

const digitos = (texto: string): string => texto.replace(/\D/g, '');

/** O CNPJ tem dois dígitos de conferência, como o CPF: um erro de digitação não passa. */
export function hasValidCnpjCheckDigits(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (tamanho: number): number => {
    const pesos =
      tamanho === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((total, peso, indice) => total + Number(cnpj[indice]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

/** O celular sem o DDI: `5533999887766` e `33999887766` são o mesmo número. */
function celularSemDdi(texto: string): string {
  const numeros = digitos(texto);
  return (numeros.length === 12 || numeros.length === 13) && numeros.startsWith('55')
    ? numeros.slice(2)
    : numeros;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A chave como o código do Pix a escreve, ou `null` se ela não é uma chave
 * daquele tipo: CPF e CNPJ só com dígitos, celular com `+55`, e-mail em
 * minúsculas, chave aleatória em minúsculas.
 */
export function normalizarChavePix(tipo: TipoDeChavePix, chave: string): string | null {
  const texto = chave.trim();
  if (texto === '') return null;
  switch (tipo) {
    case 'CPF_CNPJ': {
      const numeros = digitos(texto);
      if (numeros.length === 11) return hasValidCpfCheckDigits(numeros) ? numeros : null;
      if (numeros.length === 14) return hasValidCnpjCheckDigits(numeros) ? numeros : null;
      return null;
    }
    case 'CELULAR': {
      const numeros = celularSemDdi(texto);
      return numeros.length === 10 || numeros.length === 11 ? `+55${numeros}` : null;
    }
    case 'EMAIL':
      return texto.length <= 77 && EMAIL.test(texto) ? texto.toLowerCase() : null;
    case 'ALEATORIA':
      return UUID.test(texto) ? texto.toLowerCase() : null;
  }
}

const MENSAGEM_DA_CHAVE: Record<TipoDeChavePix, string> = {
  CPF_CNPJ: 'CPF ou CNPJ inválido. Confira os números.',
  CELULAR: 'Celular inválido. Use o DDD e o número, como (33) 99988-7766.',
  EMAIL: 'E-mail inválido.',
  ALEATORIA: 'Chave aleatória inválida. Ela tem o formato 123e4567-e12b-12d1-a456-426655440000.',
};

/** O que a loja cadastra no painel para receber o Pix direto. */
export const pixDiretoSchema = z
  .object({
    tipoDeChave: z.enum(['CPF_CNPJ', 'CELULAR', 'EMAIL', 'ALEATORIA']),
    chave: z.string().trim().min(1, 'Informe a chave Pix.').max(77, 'Chave longa demais.'),
    nomeDoRecebedor: z
      .string()
      .trim()
      .min(1, 'Informe o nome que o cliente vê no banco ao pagar.')
      .max(25, 'Use no máximo 25 caracteres: é o limite do Pix.'),
    cidade: z
      .string()
      .trim()
      .min(1, 'Informe a cidade.')
      .max(15, 'Use no máximo 15 caracteres: é o limite do Pix.'),
    /** DDD e número, só dígitos: é para onde o cliente manda o comprovante. */
    whatsapp: z
      .string()
      .transform(celularSemDdi)
      .refine((numeros) => numeros.length === 10 || numeros.length === 11, {
        message: 'Informe o WhatsApp com DDD.',
      }),
  })
  .superRefine((dados, contexto) => {
    if (normalizarChavePix(dados.tipoDeChave, dados.chave) === null) {
      contexto.addIssue({
        code: 'custom',
        path: ['chave'],
        message: MENSAGEM_DA_CHAVE[dados.tipoDeChave],
      });
    }
  });

/** O WhatsApp com o DDI, no formato do link `wa.me`. */
export function whatsappComDdi(whatsapp: string): string {
  return `55${celularSemDdi(whatsapp)}`;
}

/* ---------------------------------------------------------------------------
 * O código do Pix (BR Code, "copia e cola")
 * ------------------------------------------------------------------------ */

/** Um campo do código: identificador, tamanho com dois dígitos, valor. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/**
 * O CRC16 do Pix: CCITT-FALSE, polinômio 0x1021, começando em 0xFFFF, sobre o
 * código inteiro até o `6304` do próprio campo do CRC. O código é só ASCII, então
 * cada caractere é um byte.
 */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let indice = 0; indice < texto.length; indice += 1) {
    crc ^= texto.charCodeAt(indice) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Nome e cidade do recebedor como o banco os lê: maiúsculas, sem acento e sem
 * símbolo. Um caractere fora do ASCII faz alguns bancos recusarem o código.
 */
function paraOBanco(texto: string, limite: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

export interface DadosDoPixCopiaECola {
  /** Já normalizada por `normalizarChavePix`. */
  chave: string;
  nomeDoRecebedor: string;
  cidade: string;
  /** Em reais, com até dois decimais. */
  valor: number;
  /**
   * O número do pedido, para o cliente e a loja acharem o Pix no extrato. Só
   * letras e números, até 25 — alguns bancos o ignoram, então não concilia sozinho.
   */
  identificador: string;
}

/**
 * O Pix "estático com valor": o cliente escaneia (ou cola) e o banco já mostra o
 * valor e o nome de quem recebe. Estático quer dizer que o código não é uma
 * cobrança do banco — não há vencimento, e pagar duas vezes é possível.
 */
export function gerarPixCopiaECola(dados: DadosDoPixCopiaECola): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', dados.chave);
  const identificador = dados.identificador.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const semCrc =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', dados.valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', paraOBanco(dados.nomeDoRecebedor, 25)) +
    campo('60', paraOBanco(dados.cidade, 15)) +
    campo('62', campo('05', identificador)) +
    '6304';
  return semCrc + crc16(semCrc);
}
