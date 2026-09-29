'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormularioDeDestaque } from '@/components/loja/formulario-de-destaque';
import { useDestaques } from '@/components/loja/marketing';
import { session } from '@/lib/session';

export default function EditarDestaquePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const destaques = useDestaques();

  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }

  const destaque = destaques.data?.find((item) => item.id === id);

  return (
    <div className="space-y-5">
      <header>
        <h1>Editar destaque</h1>
      </header>

      {destaques.isLoading && (
        <div className="space-y-3" role="status">
          <span className="sr-only">Carregando o destaque...</span>
          <Skeleton className="h-32" />
          <Skeleton className="h-56" />
        </div>
      )}

      {destaques.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar o destaque.</p>
            <Button type="button" variant="outline" onClick={() => void destaques.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {destaques.isSuccess && !destaque && (
        <Card>
          <CardContent className="space-y-3 py-8 text-sm">
            <p className="font-medium">Destaque não encontrado.</p>
            <p className="text-muted-foreground">Ele pode ter sido excluído em outra tela.</p>
            <Link
              href="/loja/marketing/destaques"
              className={buttonVariants({ variant: 'outline' })}
            >
              Voltar aos destaques
            </Link>
          </CardContent>
        </Card>
      )}

      {destaque && <FormularioDeDestaque destaque={destaque} />}
    </div>
  );
}
