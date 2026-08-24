'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStatus } from '@motoboycity/types';
import { Button } from '@/components/ui/button';
import { CancelDeliveryDialog } from '@/components/operations/cancel-delivery-dialog';
import { StatusChip } from '@/components/orders/status-chip';
import { Card, CardContent } from '@/components/ui/card';
import { deliveriesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { useAdminActiveDeliveryTracking } from '@/lib/use-active-delivery-tracking';
import { useMoney } from '@/lib/money';

const STATUS_FILTERS: { label: string; value: DeliveryStatus | 'ALL' }[] = [
  { label: 'Todos os pedidos', value: 'ALL' },
  { label: 'Agendados', value: 'SCHEDULED' },
  { label: 'Buscando motoboy', value: 'AWAITING_DRIVER' },
  { label: 'A caminho da coleta', value: 'ACCEPTED' },
  { label: 'Em rota', value: 'COLLECTED' },
  { label: 'Voltando à loja', value: 'DELIVERED' },
  { label: 'Concluídos', value: 'COMPLETED' },
  { label: 'Cancelados', value: 'CANCELLED' },
  { label: 'Aguardando pagamento', value: 'AWAITING_PAYMENT' },
];

const CANCELLABLE_STATUSES: DeliveryStatus[] = [
  'SCHEDULED',
  'AWAITING_DRIVER',
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'AWAITING_PAYMENT',
];

const trackingDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

/** Quantos pedidos por pagina. O servidor aceita ate 100. */
const TAMANHO_DA_PAGINA = 25;

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function AdminOrdersPage() {
  const money = useMoney();
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'ALL'>('ALL');
  const [pagina, setPagina] = useState(1);
  const trackingQuery = useAdminActiveDeliveryTracking();

  const token = session.getToken();

  /**
   * PAGINADO no servidor.
   *
   * Esta tela chamava `GET /deliveries`, que nao tem `take` nem `skip` e ainda
   * traz empresa e tipo de servico embutidos em cada linha. Com o filtro em
   * "todos" ela pedia a base inteira: hoje funciona com dezenas de pedidos, e
   * com um mes de operacao real vira milhares de linhas atravessando a rede
   * para preencher uma tabela de 25.
   */
  const deliveriesQuery = useQuery({
    queryKey: ['admin', 'deliveries', statusFilter, pagina],
    queryFn: () =>
      deliveriesApi.search(token as string, {
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        page: pagina,
        pageSize: TAMANHO_DA_PAGINA,
      }),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça login como administrador para ver os pedidos.
      </p>
    );
  }

  const resultado = deliveriesQuery.data;
  const deliveries = resultado?.items ?? [];
  const totalDePaginas = resultado ? Math.max(1, Math.ceil(resultado.total / resultado.pageSize)) : 1;
  const activeTracking = trackingQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie e visualize todos os pedidos realizados na plataforma
        </p>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Rastreamento ao vivo</h2>
            <span className="text-xs text-muted-foreground">
              {activeTracking.length} entrega{activeTracking.length === 1 ? '' : 's'} ativa
              {activeTracking.length === 1 ? '' : 's'}
            </span>
          </div>
          {trackingQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando rastreamento...</p>
          ) : activeTracking.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                Nenhuma entrega com rastreamento ativo.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeTracking.map((tracking) => (
                <Card key={tracking.deliveryId} className="order-list-card">
                  <CardContent className="space-y-1 py-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        className="font-medium hover:underline"
                        href={`/pedidos/${tracking.deliveryId}`}
                      >
                        Pedido #{tracking.displayNumber}
                      </Link>
                      <StatusChip status={tracking.status} />
                    </div>
                    <p className="text-muted-foreground">
                      {tracking.companyName} · {tracking.driver.name}
                    </p>
                    {tracking.lastLocation ? (
                      <a
                        className="text-primary underline-offset-4 hover:underline"
                        href={mapsUrl(tracking.lastLocation.lat, tracking.lastLocation.lng)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver posição ({tracking.lastLocation.lat.toFixed(5)},{' '}
                        {tracking.lastLocation.lng.toFixed(5)}) ·{' '}
                        {trackingDateFormatter.format(new Date(tracking.lastLocation.capturedAt))}
                      </a>
                    ) : (
                      <p className="text-muted-foreground">Aguardando o primeiro ponto de GPS.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>


        {deliveriesQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando pedidos...</p>
        )}
        {deliveriesQuery.isError && (
          <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>
        )}
        {deliveriesQuery.isSuccess && deliveries.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Nenhum pedido encontrado.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {deliveries.map((delivery) => (
            <Card key={delivery.id} className="order-list-card">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">
                    #{delivery.displayNumber} — {delivery.companyName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {delivery.serviceTypeName} ·{' '}
                    {delivery.distanceKm !== null ? `${delivery.distanceKm} km` : 'sem distância'}
                    {delivery.requiresReturn && ' · com retorno'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <StatusChip status={delivery.status} />
                    <p className="font-medium">
                      {money(delivery.totalValue, 'A calcular na entrega')}
                    </p>
                  </div>
                  <Link
                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                    href={`/pedidos/${delivery.id}`}
                  >
                    Detalhes
                  </Link>
                  {CANCELLABLE_STATUSES.includes(delivery.status) && (
                    /*
                      Numa linha de tabela, cercada de outras linhas iguais, a
                      chance de clicar na errada e maior que no painel lateral.
                    */
                    <CancelDeliveryDialog
                      token={token}
                      deliveryId={delivery.id}
                      displayNumber={delivery.displayNumber}
                      companyName={delivery.companyName}
                      status={delivery.status}
                      /*
                        A lista nao traz o nome do motoboy. O dialogo diz "um
                        motoboy" nesse caso — melhor do que afirmar um nome que
                        esta tela nao sabe.
                      */
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {resultado && resultado.total > 0 && (
          /*
            A contagem vem do servidor, entao ela e do universo inteiro do
            filtro — e nao do que coube nesta pagina. Era exatamente esse tipo
            de diferenca que fazia a home dizer "20" e listar 8.
          */
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {resultado.total} pedido(s) · página {resultado.page} de {totalDePaginas}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || deliveriesQuery.isFetching}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalDePaginas || deliveriesQuery.isFetching}
                onClick={() => setPagina((atual) => atual + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      <Card className="premium-panel h-fit lg:sticky lg:top-24">
        <CardContent className="space-y-1 pt-6">
          {STATUS_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => {
                setStatusFilter(value);
                // Sem isto, filtrar estando na pagina 4 pediria uma pagina 4
                // que talvez nao exista no novo filtro, e a tela viria vazia.
                setPagina(1);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                statusFilter === value
                  ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
                  : ''
              }`}
            >
              {label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
