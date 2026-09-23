'use client';

import { use, useMemo, useState } from 'react';
import { Clock, ImageOff } from 'lucide-react';
import {
  CATEGORIAS_DE_EXEMPLO,
  LOJA_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  pendenciasDoProduto,
  type ProdutoDeExemplo,
} from '@/lib/loja-mock';
import { FolhaDoProduto, type ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';

/**
 * A página que o cliente abre — a loja, e não o painel.
 *
 * Desenhada como cardápio e não como landing page: o cliente veio escolher
 * comida, e cada rolagem a mais é um item que ele não viu. Daí a linha com
 * miniatura à direita em vez de cartão com foto grande, divisória em vez de
 * sombra, e nenhum bloco de boas-vindas antes do primeiro produto.
 *
 * Em produção o endereço é `pedidos.…/{slug}`; aqui a rota é `/pedir/{slug}`
 * porque `/loja` já é a área do painel neste mesmo app.
 */
export default function LojaPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const loja = LOJA_DE_EXEMPLO;

  const paleta = paletaDoTema(loja.tema);
  const [aberto, setAberto] = useState<ProdutoDeExemplo | null>(null);
  const [carrinho, setCarrinho] = useState<ItemEscolhido[]>([]);

  /*
   * O cliente só vê o que dá para comprar. Rascunho e pausado somem, e produto
   * com pendência que trava a venda também — deixá-lo aqui seria oferecer algo
   * que não fecha o pedido, que é exatamente o problema que o painel avisa.
   */
  const vendaveis = useMemo(
    () =>
      PRODUTOS_DE_EXEMPLO.filter(
        (produto) =>
          produto.situacao === 'publicado' &&
          !pendenciasDoProduto(produto).some((item) => item.impedeVender),
      ),
    [],
  );

  const secoes = CATEGORIAS_DE_EXEMPLO.map((categoria) => ({
    categoria,
    produtos: vendaveis.filter((produto) => produto.categoriaId === categoria.id),
  })).filter((secao) => secao.produtos.length > 0);

  const itens = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  const total = carrinho.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);

  return (
    <div
      className="min-h-dvh"
      style={{ backgroundColor: paleta.fundo, color: paleta.texto }}
      data-slug={slug}
    >
      {/* Faixa fina na cor da marca, em vez de cabeçalho inteiro colorido: dá
          a identidade sem roubar a leitura do primeiro produto. */}
      <div className="h-1" style={{ backgroundColor: loja.corDaMarca }} />

      {/* Coluna estreita mesmo no computador. A loja é feita para o celular, e
          esticar a linha até 1200px deixaria o preço num canto e a miniatura
          no outro, com um vão no meio que o olho tem que atravessar. */}
      <div className="mx-auto w-full max-w-lg">
        <header className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
              style={{ backgroundColor: loja.corDaMarca, color: textoSobre(loja.corDaMarca) }}
              aria-hidden="true"
            >
              {loja.nome.charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl leading-tight font-bold">{loja.nome}</h1>
              <p className="mt-0.5 text-sm" style={{ color: paleta.suave }}>
                {loja.aberta ? (
                  <>
                    <span style={{ color: loja.corDeAcao }}>Aberto</span> · {loja.horario}
                  </>
                ) : (
                  <span className="font-medium">Fechado agora · {loja.horario}</span>
                )}
              </p>
            </div>
          </div>

          {/* Os três fatos que decidem o pedido, juntos e antes do cardápio. */}
          <div
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: paleta.superficie }}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" style={{ color: paleta.suave }} aria-hidden="true" />
              {loja.minutosDePreparo} a {loja.minutosDePreparo + 15} min
            </span>
            <span>
              Entrega{' '}
              {loja.taxaDeEntrega === null ? (
                <strong>a combinar</strong>
              ) : (
                <strong>{moeda(loja.taxaDeEntrega)}</strong>
              )}
            </span>
            <span style={{ color: paleta.suave }}>{loja.pagamentos.join(' · ')}</span>
          </div>
        </header>

        {!loja.aberta && (
          <p
            className="mx-4 mb-3 rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: paleta.superficie }}
          >
            Dá para ver o cardápio, mas só dá para pedir quando a loja abrir.
          </p>
        )}

        {/* Barra de categorias grudada no topo: em cardápio longo, é ela que
          evita a rolagem infinita até achar bebida. */}
        <nav
          aria-label="Categorias"
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b px-4 py-2"
          style={{ backgroundColor: paleta.fundo, borderColor: paleta.linha }}
        >
          {secoes.map(({ categoria }) => (
            <a
              key={categoria.id}
              href={`#secao-${categoria.id}`}
              className="rounded-full border px-3 py-1 text-sm whitespace-nowrap"
              style={{ borderColor: paleta.linha, color: paleta.texto }}
            >
              {categoria.nome}
            </a>
          ))}
        </nav>

        <main className={itens > 0 ? 'pb-24' : 'pb-10'}>
          {secoes.map(({ categoria, produtos }) => (
            <section key={categoria.id} id={`secao-${categoria.id}`} className="scroll-mt-12">
              <h2 className="px-4 pt-5 pb-2 text-base font-bold" style={{ color: loja.corDaMarca }}>
                {categoria.nome}
              </h2>

              {produtos.map((produto) => (
                <button
                  key={produto.id}
                  type="button"
                  onClick={() => setAberto(produto)}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left"
                  style={{ borderColor: paleta.linha }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug font-medium">
                      {produto.nome}
                    </span>
                    {produto.descricao && (
                      <span
                        className="mt-0.5 line-clamp-2 block text-[13px] leading-snug"
                        style={{ color: paleta.suave }}
                      >
                        {produto.descricao}
                      </span>
                    )}
                    <span className="mt-1.5 block text-[15px] font-semibold">
                      {produto.tamanhos.length > 0 ? (
                        <>
                          <span className="text-[13px] font-normal" style={{ color: paleta.suave }}>
                            a partir de{' '}
                          </span>
                          {moeda(Math.min(...produto.tamanhos.map((t) => t.preco)))}
                        </>
                      ) : (
                        moeda(produto.precoUnico ?? 0)
                      )}
                    </span>
                  </span>

                  {/* Miniatura à direita, e um bloco discreto quando não há foto:
                    produto sem imagem continua uma linha legível em vez de
                    virar um buraco cinza no meio do cardápio. */}
                  <span
                    className="flex size-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg"
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
                </button>
              ))}
            </section>
          ))}

          {secoes.length === 0 && (
            <p className="px-4 py-16 text-center text-sm" style={{ color: paleta.suave }}>
              Esta loja ainda não publicou nenhum produto.
            </p>
          )}
        </main>

        {/* Barra do carrinho só existe quando há carrinho. Uma barra vazia fixa
          rouba altura de tela no celular sem dizer nada. */}
        {itens > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-20 p-3">
            <button
              type="button"
              className="mx-auto flex h-13 w-full max-w-lg items-center justify-between rounded-xl px-4 text-sm font-semibold shadow-lg"
              style={{ backgroundColor: loja.corDeAcao, color: textoSobre(loja.corDeAcao) }}
            >
              <span>
                {itens} {itens === 1 ? 'item' : 'itens'}
              </span>
              <span>Ver sacola · {moeda(total)}</span>
            </button>
          </div>
        )}
      </div>

      {aberto && (
        <FolhaDoProduto
          produto={aberto}
          paleta={paleta}
          corDeAcao={loja.corDeAcao}
          aberta={loja.aberta}
          onFechar={() => setAberto(null)}
          onAdicionar={(item) => {
            setCarrinho((atual) => [...atual, item]);
            setAberto(null);
          }}
        />
      )}
    </div>
  );
}
