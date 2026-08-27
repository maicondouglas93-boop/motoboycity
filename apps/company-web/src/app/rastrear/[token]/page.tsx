import type { Metadata } from 'next';
import { PublicDeliveryTrackingView } from '@/components/tracking/public-delivery-tracking';

export const metadata: Metadata = {
  title: 'Acompanhe sua entrega | MOTOboyCity',
  description: 'Acompanhamento em tempo real da entrega.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PublicTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicDeliveryTrackingView token={token} />;
}
