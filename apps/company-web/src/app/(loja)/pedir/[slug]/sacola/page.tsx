import { notFound, redirect } from 'next/navigation';
import { lojaDoLink } from '@/lib/loja-publica';
import { Sacola } from './sacola';

/**
 * A sacola da loja do link. A loja vem do servidor, como na página do
 * cardápio: as cores, os bairros, o pagamento e a retirada são os dela.
 */
export default async function SacolaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const achada = await lojaDoLink(slug);
  if (achada.tipo === 'nao-existe') notFound();
  if (achada.tipo === 'mudou') redirect(`/pedir/${achada.slug}/sacola`);
  return <Sacola slug={slug} cardapio={achada.cardapio} />;
}
