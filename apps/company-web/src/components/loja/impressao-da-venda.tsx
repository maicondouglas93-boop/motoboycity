'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import styles from '@/components/orders/delivery-print-view.module.css';
import { Button } from '@/components/ui/button';
import { companyStoreSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { ComandaDaVenda } from './comanda-da-venda';
import { CHAVE_DA_CONFIGURACAO } from './link-da-loja';
import { useVendasDaLoja } from './vendas';

/**
 * A tela de impressão de uma venda: os controles na tela, e só a comanda no
 * papel — o mesmo arranjo da impressão de entregas (`DeliveryPrintView`).
 *
 * A venda vem da mesma consulta da tela de Vendas — só a da empresa de quem
 * imprime, porque a API só devolve as dela.
 */
export function ImpressaoDaVenda({ numero }: { numero: number }) {
  const token = session.getToken();
  const consulta = useVendasDaLoja();
  const configuracao = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => companyStoreSettingsApi.settings(token as string),
    enabled: Boolean(token),
  });
  const carregada = consulta.data !== undefined;
  const venda = consulta.data?.find((item) => item.numero === numero);
  const [impressoEm, setImpressoEm] = useState(() => new Date().toISOString());

  async function imprimir() {
    // A hora no papel é a da impressão, e não a de quando a página abriu.
    flushSync(() => setImpressoEm(new Date().toISOString()));
    await document.fonts?.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    window.print();
  }

  return (
    <main className={styles['page']}>
      <header className={styles['controls']}>
        <Link
          href="/loja/vendas"
          className="inline-flex items-center gap-1 text-sm text-portal-deep"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Voltar para vendas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Imprimir pedido</h1>
            <p className="text-sm text-muted-foreground">
              Comanda da loja online · Bobina de 80 mm
            </p>
          </div>
          <Button onClick={() => void imprimir()} disabled={!venda}>
            <Printer aria-hidden="true" /> Imprimir pedido
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecione a Elgin i8/i9 instalada, papel de 80 mm, escala 100% e desative cabeçalhos e
          rodapés do navegador.
        </p>
        {consulta.isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar o pedido.
          </p>
        )}
        {!carregada && !consulta.isError && <p role="status">Carregando pedido…</p>}
        {carregada && !venda && (
          <p role="alert" className="text-sm text-destructive">
            O pedido #{numero} não está entre as vendas dos últimos dois dias.
          </p>
        )}
      </header>
      {venda && (
        <div className={styles['paper']}>
          <ComandaDaVenda
            venda={venda}
            loja={configuracao.data?.name ?? ''}
            impressoEm={impressoEm}
          />
        </div>
      )}
    </main>
  );
}
