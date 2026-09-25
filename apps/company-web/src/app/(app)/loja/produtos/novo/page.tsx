'use client';

import { useCatalogo } from '@/components/loja/catalogo';
import { FormularioDeProduto, MolduraDoProduto } from '@/components/loja/formulario-de-produto';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** O catálogo vem junto: o formulário precisa das categorias para oferecer a seção. */
export default function NovoProdutoPage() {
  const catalogo = useCatalogo();

  if (catalogo.isError) {
    return (
      <MolduraDoProduto titulo="Cadastrar produto">
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
      <MolduraDoProduto titulo="Cadastrar produto">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </MolduraDoProduto>
    );
  }

  return <FormularioDeProduto categorias={catalogo.data.categories} />;
}
