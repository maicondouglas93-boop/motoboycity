'use client';

import { useState } from 'react';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useHidratado } from '@/components/loja-online/armazenamento';
import styles from '@/components/orders/delivery-print-view.module.css';
import { Button } from '@/components/ui/button';
import { useVendas } from '@/lib/loja-demo';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';
import { ComandaDaVenda } from './comanda-da-venda';

/**
 * A tela de impressão de uma venda: os controles na tela, e só a comanda no
 * papel — o mesmo arranjo da impressão de entregas (`DeliveryPrintView`).
 *
 * DEMONSTRAÇÃO: a venda vem do `localStorage` deste navegador, como na tela de
 * Vendas. Na integração, vem da API, e a página passa a conferir que a venda é
 * da empresa de quem imprime.
 */
export function ImpressaoDaVenda({ numero }: { numero: number }) {
  const vendas = useVendas();
  const hidratado = useHidratado();
  const venda = vendas.find((item) => item.numero === numero);
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
        <p className="text-xs text-muted-foreground">
          Demonstração: a venda vem deste navegador, como na tela de Vendas.
        </p>
        {!hidratado && <p role="status">Carregando pedido…</p>}
        {hidratado && !venda && (
          <p role="alert" className="text-sm text-destructive">
            O pedido #{numero} não está nas vendas deste navegador.
          </p>
        )}
      </header>
      {venda && (
        <div className={styles['paper']}>
          <ComandaDaVenda venda={venda} loja={LOJA_DE_EXEMPLO.nome} impressoEm={impressoEm} />
        </div>
      )}
    </main>
  );
}
