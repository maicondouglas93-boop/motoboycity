'use client';

import { use } from 'react';
import { useCatalogo } from '@/components/loja/catalogo';
import { FormularioDeProduto, MolduraDoProduto } from '@/components/loja/formulario-de-produto';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * O catálogo vem junto: o formulário precisa das categorias para oferecer a seção — e, no combo,
 * dos produtos que ele pode levar. `?tipo=combo` abre o cadastro de combo.
 */
export default function NovoProdutoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = use(searchParams);
  const combo = tipo === 'combo';
  const catalogo = useCatalogo();
  const titulo = combo ? 'Cadastrar combo' : 'Cadastrar produto';

  if (catalogo.isError) {
    return (
      <MolduraDoProduto titulo={titulo}>
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar as categorias.</p>
            <Button type="button" variant="outline" onClick={() => void catalogo.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </MolduraDoProduto>
    );
  }

  if (!catalogo.data) {
    return (
      <MolduraDoProduto titulo={titulo}>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </MolduraDoProduto>
    );
  }

  return (
    <FormularioDeProduto
      categorias={catalogo.data.categories}
      produtos={catalogo.data.products}
      tipo={combo ? 'COMBO' : 'PRODUCT'}
    />
  );
}
