'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormularioDePromocao } from '@/components/loja/formulario-de-promocao';
import { usePromocoes } from '@/components/loja/marketing';
import { session } from '@/lib/session';

export default function EditarPromocaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const promocoes = usePromocoes();

  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }

  const promocao = promocoes.data?.find((item) => item.id === id);

  return (
    <div className="space-y-5">
      <header>
        <h1>Editar promoção</h1>
        {promocao && promocao.usos > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Já valeu em {promocao.usos} {promocao.usos === 1 ? 'pedido' : 'pedidos'}. Mudar agora
            vale para os próximos; os que já foram feitos não mudam.
          </p>
        )}
      </header>

      {promocoes.isLoading && (
        <div className="space-y-3" role="status">
          <span className="sr-only">Carregando a promoção...</span>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {promocoes.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar a promoção.</p>
            <Button type="button" variant="outline" onClick={() => void promocoes.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {promocoes.isSuccess && !promocao && (
        <Card>
          <CardContent className="space-y-3 py-8 text-sm">
            <p className="font-medium">Promoção não encontrada.</p>
            <p className="text-muted-foreground">Ela pode ter sido excluída em outra tela.</p>
            <Link
              href="/loja/marketing/promocoes"
              className={buttonVariants({ variant: 'outline' })}
            >
              Voltar às promoções
            </Link>
          </CardContent>
        </Card>
      )}

      {promocao && <FormularioDePromocao promocao={promocao} />}
    </div>
  );
}
