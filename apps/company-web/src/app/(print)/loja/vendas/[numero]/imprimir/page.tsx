import { ImpressaoDaVenda } from '@/components/loja/impressao-da-venda';

export default async function ImprimirVendaPage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;
  return <ImpressaoDaVenda key={numero} numero={Number(numero)} />;
}
