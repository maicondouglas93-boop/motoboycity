import { notFound, redirect } from 'next/navigation';
import { lojaDoLink } from '@/lib/loja-publica';
import { MeusPedidos } from './meus-pedidos';

/** Os pedidos do cliente na loja do link. A loja vem do servidor, como no cardápio. */
export default async function PedidosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const achada = await lojaDoLink(slug);
  if (achada.tipo === 'nao-existe') notFound();
  if (achada.tipo === 'mudou') redirect(`/pedir/${achada.slug}/pedidos`);
  return <MeusPedidos slug={slug} cardapio={achada.cardapio} />;
}
