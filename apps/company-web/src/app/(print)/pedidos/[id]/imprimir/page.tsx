import { DeliveryPrintView } from '@/components/orders/delivery-print-view';

export default async function PrintDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeliveryPrintView key={id} deliveryId={id} />;
}
