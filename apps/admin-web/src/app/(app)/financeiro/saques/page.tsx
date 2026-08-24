import { redirect } from 'next/navigation';

/**
 * A fila de saques passou a morar dentro da área financeira, na aba Carteiras.
 *
 * Esta rota continua existindo porque o link dela já circulou em conversa e em
 * favorito do navegador. Redirecionar custa um arquivo de três linhas; deixar
 * quebrar custa a confiança de quem clicou.
 *
 * `permanent: false` de propósito: se um dia a fila voltar a ter tela própria,
 * um 308 já estaria gravado no navegador de todo mundo e seria difícil desfazer.
 */
export default function SaquesRedirect() {
  redirect('/financeiro?aba=carteiras');
}
