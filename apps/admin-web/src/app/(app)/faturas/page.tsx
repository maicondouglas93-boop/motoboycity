import { redirect } from 'next/navigation';

/**
 * A lista de faturas passou a morar na área financeira, na aba Faturas.
 *
 * Só a LISTA foi movida. O detalhe (`/faturas/[id]`) continua onde estava: é a
 * tela que se abre a partir de um link de fatura específica, e mudar o endereço
 * dela quebraria referência em conversa e em favorito sem ganho nenhum.
 *
 * `permanent: false` de propósito — um 308 ficaria gravado no navegador de todo
 * mundo e seria difícil desfazer se a lista voltar a ter tela própria.
 */
export default function FaturasRedirect() {
  redirect('/financeiro?aba=faturas');
}
