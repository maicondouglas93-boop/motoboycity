'use client';

import { use } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { FormularioDeProduto } from '@/components/loja/formulario-de-produto';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PRODUTOS_DE_EXEMPLO } from '@/lib/loja-mock';

export default function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const produto = PRODUTOS_DE_EXEMPLO.find((item) => item.id === id);

  /*
   * Um link velho, um produto excluído noutra aba, um id digitado à mão. Sem
   * este caminho a tela quebraria com erro de React, e o lojista não saberia o
   * que fez nem para onde ir.
   */
  if (!produto) {
    return (
      <div className="max-w-3xl space-y-5">
        <div>
          <Link
            href="/loja/produtos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Produtos
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Produto não encontrado</h1>
        </div>
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>Este produto não existe mais, ou o endereço está errado. Nada foi alterado.</p>
            <Link href="/loja/produtos" className={buttonVariants({ variant: 'outline' })}>
              Voltar para a lista
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <FormularioDeProduto produto={produto} />;
}
