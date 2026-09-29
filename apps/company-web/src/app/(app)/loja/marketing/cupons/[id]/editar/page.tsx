'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormularioDeCupom } from '@/components/loja/formulario-de-cupom';
import { useCupons } from '@/components/loja/marketing';
import { session } from '@/lib/session';

export default function EditarCupomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const cupons = useCupons();

  if (!session.getToken()) {
    return <p className="text-sm text-muted-foreground">Faça login para continuar.</p>;
  }

  const cupom = cupons.data?.find((item) => item.id === id);

  return (
    <div className="space-y-5">
      <header>
        <h1>Editar cupom</h1>
        {cupom && cupom.usos > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Já foi usado em {cupom.usos} {cupom.usos === 1 ? 'pedido' : 'pedidos'}. Mudar agora vale
            para os próximos; os que já foram feitos não mudam.
          </p>
        )}
      </header>

      {cupons.isLoading && (
        <div className="space-y-3" role="status">
          <span className="sr-only">Carregando o cupom...</span>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {cupons.isError && (
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar o cupom.</p>
            <Button type="button" variant="outline" onClick={() => void cupons.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {cupons.isSuccess && !cupom && (
        <Card>
          <CardContent className="space-y-3 py-8 text-sm">
            <p className="font-medium">Cupom não encontrado.</p>
            <p className="text-muted-foreground">Ele pode ter sido excluído em outra tela.</p>
            <Link href="/loja/marketing/cupons" className={buttonVariants({ variant: 'outline' })}>
              Voltar aos cupons
            </Link>
          </CardContent>
        </Card>
      )}

      {cupom && <FormularioDeCupom cupom={cupom} />}
    </div>
  );
}
