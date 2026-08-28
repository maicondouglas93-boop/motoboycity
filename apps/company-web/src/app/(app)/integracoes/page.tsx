import { AiqfomeIntegrationPanel } from '@/components/integrations/aiqfome-integration-panel';

interface IntegrationsPageProps {
  searchParams: Promise<{ aiqfome?: string; reason?: string }>;
}

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="font-mono text-xs font-semibold tracking-[0.16em] text-portal uppercase">
          Conexões da empresa
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight text-portal-deep">
          Integrações
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte sua loja aos pedidos e mantenha a operação manual funcionando em paralelo.
        </p>
      </div>
      <AiqfomeIntegrationPanel callbackStatus={params.aiqfome} callbackReason={params.reason} />
    </div>
  );
}
