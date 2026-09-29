import { EsqueletoDoCheckout } from '@/components/loja-online/esqueleto-do-checkout';
import { paletaDoTema } from '@/components/loja-online/paleta';

/**
 * O que aparece no instante do toque em "Continuar", enquanto o servidor busca
 * a loja. Sem este arquivo o app ficava parado na página anterior até a
 * resposta chegar, e o formulário surgia de uma vez.
 *
 * Aqui a loja ainda não é conhecida (é a resposta que ela espera), então as
 * cores são as neutras do tema claro. Assim que a página chega, o esqueleto
 * troca para o da própria loja, com as cores dela.
 */
export default function CarregandoASacola() {
  const paleta = paletaDoTema('CLARO');
  return <EsqueletoDoCheckout paleta={paleta} corDaMarca={paleta.linha} />;
}
