'use client';

import type { StoreProduct } from '@motoboycity/types';
import { economiaDoCombo, valorSeparadoDoCombo } from '@motoboycity/validation';
import { Plus, Trash2 } from 'lucide-react';
import { motivoDeNaoEntrarNoCombo } from '@/components/loja/combo';
import {
  LIMITES_DO_PRODUTO,
  precoParaTexto,
  textoParaPreco,
  type LinhaDoCombo,
  type ProdutoNoFormulario,
} from '@/components/loja/produto-no-formulario';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

/**
 * O cartão "O que vem no combo": os produtos da loja que o combo leva, com o tamanho fixo de quem
 * tem tamanhos e a quantidade de cada um. Embaixo, a conta que a lojista faz de cabeça — quanto os
 * itens custariam separados e quanto o cliente economiza —, para ela ver se o combo tem graça.
 */
export function ItensDoCombo({
  estado,
  produtos,
  porId,
  aoAcrescentar,
  aoAlterar,
  aoEscolherProduto,
  aoRemover,
}: {
  estado: ProdutoNoFormulario;
  produtos: readonly StoreProduct[];
  porId: ReadonlyMap<string, StoreProduct>;
  aoAcrescentar: () => void;
  aoAlterar: (chave: string, mudanca: Partial<LinhaDoCombo>) => void;
  aoEscolherProduto: (chave: string, produtoId: string) => void;
  aoRemover: (chave: string) => void;
}) {
  // Um combo não leva outro combo.
  const doCatalogo = produtos.filter((produto) => produto.kind === 'PRODUCT');

  const lidos = estado.itensDoCombo
    .filter((linha) => linha.produtoId !== '')
    .map((linha) => ({
      productId: linha.produtoId,
      sizeId: linha.tamanhoId === '' ? null : linha.tamanhoId,
      quantity: Math.max(1, Math.floor(Number(linha.quantidade)) || 1),
    }));
  const separado = lidos.length > 0 ? valorSeparadoDoCombo(lidos, (id) => porId.get(id)) : null;
  const preco = textoParaPreco(estado.precoUnico);
  const precoValido = preco !== null && !Number.isNaN(preco) && preco > 0;
  const economia = separado !== null && precoValido ? economiaDoCombo(preco, separado) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>O que vem no combo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {estado.itensDoCombo.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum produto ainda. Escolha o que o cliente leva no combo: ele paga o preço do combo,
            e não a soma dos itens.
          </p>
        )}

        <div className="space-y-2">
          {estado.itensDoCombo.map((linha) => {
            const escolhido = porId.get(linha.produtoId);
            const comTamanhos = (escolhido?.sizes.length ?? 0) > 0;
            return (
              <div
                key={linha.chave}
                // No celular, o produto ocupa a linha de cima e o resto (tamanho, quantidade, tirar)
                // fica embaixo; de tela larga para cima, tudo numa linha só.
                className="grid grid-cols-[1fr_72px_40px] items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_150px_80px_40px] sm:rounded-none sm:border-0 sm:p-0"
              >
                <select
                  aria-label="Produto do combo"
                  value={linha.produtoId}
                  onChange={(event) => aoEscolherProduto(linha.chave, event.target.value)}
                  className="col-span-3 h-10 w-full rounded-md border bg-background px-3 text-sm sm:col-span-1"
                >
                  <option value="">Escolha o produto</option>
                  {doCatalogo.map((produto) => {
                    const motivo = motivoDeNaoEntrarNoCombo(produto);
                    const fora =
                      produto.status === 'PAUSED'
                        ? ' (pausado)'
                        : produto.status === 'DRAFT'
                          ? ' (rascunho)'
                          : '';
                    return (
                      <option
                        key={produto.id}
                        value={produto.id}
                        disabled={motivo !== null && produto.id !== linha.produtoId}
                      >
                        {produto.name}
                        {fora}
                        {motivo ? ` — ${motivo}` : ''}
                      </option>
                    );
                  })}
                  {/* O produto que saiu do cardápio: a linha continua legível até a lojista tirá-la. */}
                  {linha.produtoId !== '' && !escolhido && (
                    <option value={linha.produtoId}>Produto removido</option>
                  )}
                </select>

                {comTamanhos ? (
                  <select
                    aria-label="Tamanho no combo"
                    value={linha.tamanhoId}
                    onChange={(event) => aoAlterar(linha.chave, { tamanhoId: event.target.value })}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {escolhido?.sizes.map((tamanho) => (
                      <option key={tamanho.id} value={tamanho.id}>
                        {tamanho.name} · {precoParaTexto(tamanho.price)}
                        {tamanho.available ? '' : ' (indisponível)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {escolhido ? `R$ ${precoParaTexto(escolhido.price)}` : ''}
                  </span>
                )}

                <Input
                  aria-label="Quantidade no combo"
                  inputMode="numeric"
                  value={linha.quantidade}
                  maxLength={2}
                  onChange={(event) => aoAlterar(linha.chave, { quantidade: event.target.value })}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Tirar ${escolhido?.name ?? 'o item'} do combo`}
                  onClick={() => aoRemover(linha.chave)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={aoAcrescentar}
          disabled={estado.itensDoCombo.length >= LIMITES_DO_PRODUTO.itensDoCombo}
        >
          <Plus className="size-4" /> Adicionar produto
        </Button>

        {separado !== null && (
          <p className="text-sm" role="status">
            Comprados separados, os itens custam <strong>R$ {precoParaTexto(separado)}</strong>.
            {economia !== null &&
              (economia > 0 ? (
                <>
                  {' '}
                  O cliente economiza <strong>R$ {precoParaTexto(economia)}</strong> (
                  {Math.round((economia / separado) * 100)}%) no combo.
                </>
              ) : (
                <span className="text-muted-foreground">
                  {' '}
                  O combo custa o mesmo que os itens separados, ou mais: o cliente não vê vantagem
                  nele.
                </span>
              ))}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          O combo não tem estoque próprio: vale o dos produtos que ele leva. Quando um deles acaba,
          o combo aparece como &ldquo;Esgotado&rdquo;; se um deles for pausado ou excluído, o combo
          sai do ar até você trocar o item.
        </p>
      </CardContent>
    </Card>
  );
}
