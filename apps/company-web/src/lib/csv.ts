/**
 * Exportação para CSV que o Excel brasileiro abre sem reclamar.
 *
 * Três detalhes que decidem se o arquivo é usável ou vira uma coluna só:
 *
 * 1. **Separador ponto e vírgula.** O Excel em português usa a vírgula como
 *    separador decimal, então um CSV com vírgula abre tudo numa coluna.
 * 2. **BOM no início.** Sem ele o Excel lê o arquivo como Latin-1 e "João"
 *    vira "JoÃ£o".
 * 3. **Aspas dobradas.** Um campo que contém aspas quebra a linha inteira se
 *    elas não forem escapadas.
 */
const SEPARATOR = ';';
const BOM = '﻿';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  const withoutLeadingSpaces = text.trimStart();
  const isLocalizedNumber = /^-?\d+(?:[.,]\d+)?$/.test(withoutLeadingSpaces);

  /**
   * Excel interpreta células iniciadas por estes caracteres como fórmulas.
   * Nomes, e-mails e números externos podem vir de usuários, então precisam
   * chegar como texto. Números negativos legítimos continuam calculáveis.
   */
  if (
    typeof value === 'string' &&
    (/^[=+@]/.test(withoutLeadingSpaces) ||
      (withoutLeadingSpaces.startsWith('-') && !isLocalizedNumber))
  ) {
    text = `'${text}`;
  }
  // Só envolve em aspas quando precisa — arquivo mais limpo de ler no editor.
  if (text.includes(SEPARATOR) || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const linhas = [headers, ...rows].map((linha) => linha.map(escapeCell).join(SEPARATOR));
  return BOM + linhas.join('\r\n');
}

/**
 * Entrega o arquivo ao navegador.
 *
 * O `revokeObjectURL` não é zelo cosmético: sem ele o blob fica na memória da
 * aba até recarregar, e quem exporta um relatório grande várias vezes acumula
 * cada versão.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
