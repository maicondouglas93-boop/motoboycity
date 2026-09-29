'use client';

import { ImageOff } from 'lucide-react';
import type { PromocaoPublica } from '@motoboycity/types';
import type { DestaqueNaVitrine } from '@motoboycity/validation';
import type { ProdutoDeExemplo } from '@/lib/loja-mock';
import { ofertaNaVitrine } from '@/lib/loja-promocoes';
import estilos from '@/components/loja-online/loja.module.css';
import { moeda, type Paleta } from '@/components/loja-online/paleta';
import { SeloDePromocao } from '@/components/loja-online/selo-de-promocao';

/**
 * Os destaques no alto do cardápio: um bloco com título por destaque, e uma fileira
 * de cartões que o cliente percorre com o dedo.
 *
 * É só um lugar de honra: o cartão abre a MESMA folha do produto da lista, e o
 * preço é o da lista — com o "De / Por" quando o produto está em promoção, pela
 * mesma regra. Quais destaques aparecem e com quais produtos é decidido por
 * `destaquesDaVitrine` (datas, produtos à venda); aqui só se desenha.
 */
export function DestaquesDaVitrine({
  destaques,
  produtos,
  promocoes,
  agora,
  paleta,
  corDaMarca,
  corDeAcao,
  aoAbrir,
}: {
  destaques: DestaqueNaVitrine[];
  /** Os produtos à venda, por id. */
  produtos: ReadonlyMap<string, ProdutoDeExemplo>;
  promocoes: PromocaoPublica[];
  /** A hora da tela; `null` antes de hidratar. */
  agora: number | null;
  paleta: Paleta;
  corDaMarca: string;
  corDeAcao: string;
  aoAbrir: (produto: ProdutoDeExemplo) => void;
}) {
  if (destaques.length === 0) return null;

  return (
    // `secao-destaques`: é por este id que a barra de categorias leva até aqui.
    <div id="secao-destaques" className="scroll-mt-14">
      {destaques.map((destaque) => (
        <section key={destaque.id} aria-labelledby={`destaque-${destaque.id}`}>
          <h2
            id={`destaque-${destaque.id}`}
            className="px-4 pt-5 pb-2 text-base font-bold"
            style={{ color: corDaMarca }}
          >
            {destaque.titulo}
          </h2>
          {/* A fileira rola de lado sozinha; a barra de rolagem some (o dedo basta),
              e cada cartão para no começo da tela. */}
          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {destaque.produtoIds.map((id) => {
              const produto = produtos.get(id);
              if (!produto) return null;
              const oferta = ofertaNaVitrine(produto, promocoes, agora);
              const menorPreco =
                produto.tamanhos.length > 0
                  ? Math.min(...produto.tamanhos.map((tamanho) => tamanho.preco))
                  : (produto.precoUnico ?? 0);
              return (
                <li key={id} className="w-36 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => aoAbrir(produto)}
                    className={`${estilos['foco']} block w-full rounded-lg text-left`}
                  >
                    <span
                      className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg"
                      style={{ backgroundColor: paleta.superficie }}
                    >
                      {produto.imagemUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={produto.imagemUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff
                          className="size-5"
                          style={{ color: paleta.suave, opacity: 0.5 }}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-[14px] leading-snug font-medium">
                      {produto.nome}
                    </span>
                    <span className="mt-0.5 block text-[14px] font-semibold">
                      {produto.tamanhos.length > 0 && (
                        <span className="text-xs font-normal" style={{ color: paleta.suave }}>
                          a partir de{' '}
                        </span>
                      )}
                      {oferta?.de != null && oferta.por != null && (
                        <s className="mr-1 text-xs font-normal" style={{ color: paleta.suave }}>
                          {moeda(oferta.de)}
                        </s>
                      )}
                      {moeda(oferta?.por ?? menorPreco)}
                    </span>
                    {oferta && (
                      <span className="mt-1 block">
                        <SeloDePromocao rotulo={oferta.rotulo} corDeAcao={corDeAcao} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
