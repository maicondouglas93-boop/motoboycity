'use client';

import { use } from 'react';
import Link from 'next/link';
import { useMutationState } from '@tanstack/react-query';
import { chaveDaExclusao, useCatalogo } from '@/components/loja/catalogo';
import { FormularioDeProduto, MolduraDoProduto } from '@/components/loja/formulario-de-produto';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function EditarProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ foto?: string }>;
}) {
  const { id } = use(params);
  const { foto } = use(searchParams);
  const catalogo = useCatalogo();
  const produto = catalogo.data?.products.find((item) => item.id === id);

  /*
   * O produto some do catálogo no instante em que esta tela o exclui, antes
   * de a navegação para a lista terminar. Sem isto, quem acabou de excluir
   * leria "não encontrado" por um instante.
   */
  const excluidoAqui = useMutationState({
    filters: { mutationKey: chaveDaExclusao(id) },
    select: (mutacao) => mutacao.state.status,
  }).some((status) => status === 'pending' || status === 'success');

  if (catalogo.isError) {
    return (
      <MolduraDoProduto titulo="Editar produto">
        <Card>
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-destructive">Não foi possível carregar o produto.</p>
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
      <MolduraDoProduto titulo="Editar produto">
        <p className="text-sm text-muted-foreground">Carregando o produto...</p>
      </MolduraDoProduto>
    );
  }

  if (!produto && excluidoAqui) {
    return (
      <MolduraDoProduto titulo="Produto excluído">
        <p className="text-sm text-muted-foreground">Voltando para a lista...</p>
      </MolduraDoProduto>
    );
  }

  /*
   * Um link velho, um produto excluído noutra aba, um id digitado à mão. Sem
   * este caminho a tela quebraria com erro de React, e o lojista não saberia o
   * que fez nem para onde ir.
   */
  if (!produto) {
    return (
      <MolduraDoProduto titulo="Produto não encontrado">
        <Card>
          <CardContent className="space-y-3 py-6 text-sm text-muted-foreground">
            <p>Este produto não existe mais, ou o endereço está errado.</p>
            <Link href="/loja/produtos" className={buttonVariants({ variant: 'outline' })}>
              Voltar para a lista
            </Link>
          </CardContent>
        </Card>
      </MolduraDoProduto>
    );
  }

  // A chave prende o formulário a este produto: uma releitura do catálogo em
  // segundo plano não apaga o que está sendo digitado.
  return (
    <FormularioDeProduto
      key={produto.id}
      produto={produto}
      categorias={catalogo.data.categories}
      avisoDaFoto={
        foto === 'falhou'
          ? 'O produto foi salvo, mas a foto não subiu. Tente de novo por aqui.'
          : null
      }
    />
  );
}
