'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { companyProfileApi, deliveriesApi } from '@/lib/api-client';
import { authUserQueryOptions } from '@/lib/auth-user-query';
import { session } from '@/lib/session';
import { DeliveryReceipt } from './delivery-receipt';
import styles from './delivery-print-view.module.css';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente para imprimir.';
    if (error.status === 403) return 'Você não tem permissão para imprimir este pedido.';
    if (error.status === 404) return 'Pedido não encontrado ou indisponível para esta loja.';
  }
  return 'Não foi possível carregar o pedido. Tente novamente.';
}

export function DeliveryPrintView({ deliveryId }: { deliveryId: string }) {
  const token = session.getToken();
  const user = useQuery(authUserQueryOptions(token));
  const allowed = Boolean(token && user.data?.type === 'COMPANY_MEMBER' && !user.isError);
  const [printedAt, setPrintedAt] = useState(() => new Date().toISOString());
  const [preparing, setPreparing] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const order = useQuery({
    queryKey: ['company', 'delivery-print', user.data?.id, deliveryId],
    queryFn: async () => {
      if (!token || !allowed) throw new ApiError(403, { message: 'Acesso restrito.' });
      // Ambos os GETs são somente leitura. detail pode enriquecer/gravar endereços GPS.
      const profile = await companyProfileApi.get(token);
      const result = await deliveriesApi.operations(token, { deliveryId });
      const delivery = [...result.active, ...result.recent].find((item) => item.id === deliveryId);
      if (!delivery) throw new ApiError(404, { message: 'Pedido não encontrado.' });
      if (delivery.companyId !== profile.companyId) throw new ApiError(403, { message: 'Acesso restrito.' });
      return delivery;
    },
    enabled: allowed,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  async function print() {
    if (locked.current || !allowed || !order.data || order.isFetching) return;
    locked.current = true;
    setPreparing(true);
    setPrintError(null);
    try {
      // Reimpressão nunca usa silenciosamente o motoboy/status de um cupom anterior.
      await order.refetch({ throwOnError: true });
      if (!mounted.current || session.getToken() !== token) return;
      flushSync(() => setPrintedAt(new Date().toISOString()));
      await document.fonts?.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!mounted.current || session.getToken() !== token) return;
      window.print();
    } catch (error) {
      if (mounted.current) setPrintError(errorMessage(error));
    } finally {
      locked.current = false;
      if (mounted.current) setPreparing(false);
    }
  }

  const loading = user.isPending || (allowed && (order.isPending || order.isFetching));
  const error = user.isError ? errorMessage(user.error)
    : !loading && !allowed ? 'A impressão está disponível apenas para a loja responsável pelo pedido.'
      : order.isError ? errorMessage(order.error) : printError;
  const ready = allowed && order.data && !loading && !error;

  return (
    <main className={styles['page']}>
      <header className={styles['controls']}>
        <Link href="/pedidos" className="inline-flex items-center gap-1 text-sm text-portal-deep">
          <ArrowLeft className="size-4" /> Voltar para pedidos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Imprimir pedido</h1>
            <p className="text-sm text-muted-foreground">Cupom de entrega · Bobina de 80 mm</p>
          </div>
          <Button onClick={() => void print()} disabled={!ready || preparing}>
            <Printer aria-hidden="true" /> {preparing ? 'Preparando impressão…' : 'Imprimir pedido'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione a Elgin i8/i9 instalada, papel de 80 mm, escala 100% e desative cabeçalhos e rodapés do navegador.
          Cada impressão consulta novamente o status e o motoboy. Nenhum valor é incluído no cupom.
        </p>
        {loading && <p role="status">Carregando pedido…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {error && allowed && (
          <Button variant="outline" disabled={order.isFetching || preparing} onClick={() => {
            setPrintError(null);
            void order.refetch();
          }}>Tentar novamente</Button>
        )}
      </header>
      {ready && <div className={styles['paper']}>
        <DeliveryReceipt delivery={order.data!} printedAt={printedAt} />
      </div>}
    </main>
  );
}
