import { notFound, redirect } from 'next/navigation';
import { LojaPublica } from '@/components/loja-online/loja-publica';
import { lojaDoLink } from '@/lib/loja-publica';

/**
 * A loja pelo link. Link antigo leva ao atual — o panfleto e o QR impressos
 * continuam valendo —, e link sem loja (ou de loja fora do ar) é "não
 * encontrada".
 *
 * O redirecionamento é temporário de propósito: a loja pode voltar a um link
 * que já foi dela, e um permanente guardado no navegador mandaria o cliente
 * para o endereço errado.
 */
export default async function LojaPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const achada = await lojaDoLink(slug);
  if (achada.tipo === 'nao-existe') notFound();
  if (achada.tipo === 'mudou') redirect(`/pedir/${achada.slug}`);
  return <LojaPublica slug={slug} cardapio={achada.cardapio} />;
}
