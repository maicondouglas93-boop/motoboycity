'use client';

import { use, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { ChevronRight, Clock, ImageOff, Receipt } from 'lucide-react';
import {
  CATEGORIAS_DE_EXEMPLO,
  LOJA_DE_EXEMPLO,
  PRODUTOS_DE_EXEMPLO,
  formasOferecidas,
  pendenciasDoProduto,
  resumoDosPagamentos,
  situacaoDaLoja,
  type ProdutoDeExemplo,
} from '@/lib/loja-mock';
import { FolhaDoProduto, type ItemEscolhido } from '@/components/loja-online/folha-do-produto';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import {
  ajustarQuantidade,
  juntarNaSacola,
  useHidratado,
  usePedidos,
  useSacola,
} from '@/components/loja-online/armazenamento';
import { ControleDaConta, useUsuarioId } from '@/components/loja-online/conta';
import { BarraDeCategorias } from '@/components/loja-online/barra-de-categorias';
import { BarraDaSacola, type BarraDaSacolaApi } from '@/components/loja-online/barra-da-sacola';
import { FolhaDaSacola } from '@/components/loja-online/folha-da-sacola';
import { VooParaASacola } from '@/components/loja-online/voo-para-a-sacola';
import { NumeroRolante } from '@/components/loja-online/numero-rolante';
import { CURVA_ENTRADA, DURACAO } from '@/components/loja-online/movimento';
import estilos from '@/components/loja-online/loja.module.css';

/** Da nona linha em diante, todas entram juntas: ninguém espera pela décima. */
const TETO_DA_CASCATA = 8;

interface Voo {
  id: number;
  de: DOMRect;
  rotulo: string;
}

/**
 * A página que o cliente abre — a loja, e não o painel.
 *
 * Desenhada como cardápio e não como landing page: o cliente veio escolher
 * comida, e cada rolagem a mais é um item que ele não viu. Daí a linha com
 * miniatura à direita em vez de cartão com foto grande, divisória em vez de
 * sombra, e nenhum bloco de boas-vindas antes do primeiro produto.
 *
 * O movimento segue a mesma regra: só onde diz alguma coisa. As linhas entram
 * em ordem de leitura; o indicador de categoria mostra onde se está; o item
 * adicionado voa até a sacola, ligando o toque ao lugar onde ele foi parar. O
 * cabeçalho e os preços ficam parados — nada ali muda de sentido ao se mexer.
 *
 * Em produção o endereço é `pedidos.…/{slug}`; aqui a rota é `/pedir/{slug}`
 * porque `/loja` já é a área do painel neste mesmo app.
 */
export default function LojaPublicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const loja = LOJA_DE_EXEMPLO;

  const paleta = paletaDoTema(loja.tema);
  const [aberto, setAberto] = useState<ProdutoDeExemplo | null>(null);
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [voo, setVoo] = useState<Voo | null>(null);
  const barra = useRef<BarraDaSacolaApi>(null);
  const reduzir = useReducedMotion();

  // A sacola sobrevive ao recarregamento: quem fecha a página sem querer volta
  // e encontra o que tinha escolhido, em vez de recomeçar do zero.
  const { itens: carrinho, setItens: setCarrinho } = useSacola(slug);
  const usuarioId = useUsuarioId();
  const pedidos = usePedidos(slug, usuarioId);

  /*
   * A situação depende da hora, e o servidor não sabe a hora de quem abriu a
   * página: calcular antes da hidratação põe um texto no HTML e outro na tela.
   * Antes dela a loja é tratada como fechada — errar para o lado de não deixar
   * pedir é melhor do que aceitar pedido com a cozinha apagada.
   *
   * Sem relógio correndo aqui de propósito. Quando houver backend, quem decide
   * se dá para pedir é o servidor, no momento do checkout.
   */
  const hidratado = useHidratado();
  const situacao = hidratado ? situacaoDaLoja(loja, new Date()) : { aberta: false, texto: '' };

  const taxas = loja.bairros.map((bairro) => bairro.taxa);

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

  const secoes = useMemo(
    () =>
      CATEGORIAS_DE_EXEMPLO.map((categoria) => ({
        categoria,
        produtos: vendaveis.filter((produto) => produto.categoriaId === categoria.id),
      })).filter((secao) => secao.produtos.length > 0),
    [vendaveis],
  );

  const categorias = useMemo(
    () => secoes.map(({ categoria }) => ({ id: categoria.id, nome: categoria.nome })),
    [secoes],
  );

  // Posição de cada produto no cardápio inteiro, e não dentro da seção: a
  // cascata de entrada acompanha a leitura de cima para baixo.
  const ordem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const { produtos } of secoes) {
      for (const produto of produtos) mapa.set(produto.id, mapa.size);
    }
    return mapa;
  }, [secoes]);

  // Quanto de cada produto já está na sacola — o selo na miniatura.
  const naSacola = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of carrinho) {
      mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidade);
    }
    return mapa;
  }, [carrinho]);

  const itens = carrinho.reduce((soma, item) => soma + item.quantidade, 0);
  const total = carrinho.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);

  // Estáveis, porque o voo não pode recomeçar a cada renderização da página.
  const medirAlvo = useCallback(() => barra.current?.alvo() ?? null, []);
  const aoChegar = useCallback(() => {
    setVoo(null);
    barra.current?.receber();
  }, []);

  function adicionar(item: ItemEscolhido, origem: DOMRect | null) {
    setCarrinho((atual) => juntarNaSacola(atual, item));
    setAberto(null);
    // Sem voo para quem pediu menos movimento: a confirmação vem pelos números
    // da barra, que trocam sem deslocamento.
    if (!reduzir && origem) {
      setVoo({ id: Date.now(), de: origem, rotulo: `+${item.quantidade}` });
    }
  }

  function ajustar(indice: number, passo: number) {
    const esvazia = carrinho.length === 1 && (carrinho[0]?.quantidade ?? 0) + passo <= 0;
    setCarrinho((atual) => ajustarQuantidade(atual, indice, passo));
    // Tirou o último item: a folha fecha junto, em vez de ficar aberta
    // mostrando uma sacola vazia.
    if (esvazia) setSacolaAberta(false);
  }

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
                {situacao.aberta ? (
                  <span style={{ color: loja.corDeAcao }}>{situacao.texto}</span>
                ) : (
                  <span className="font-medium">{situacao.texto}</span>
                )}
              </p>
            </div>

            {/* Navegar não exige conta; comprar exige. O controle fica visível
                desde o começo para quem já tem login entrar antes, em vez de
                esbarrar na exigência só no fim, com a sacola cheia. */}
            <ControleDaConta paleta={paleta} />
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
              {taxas.length === 0 ? (
                <strong>a combinar</strong>
              ) : Math.min(...taxas) === Math.max(...taxas) ? (
                <strong>{moeda(taxas[0]!)}</strong>
              ) : (
                /* Faixa, e não um número só: a taxa depende do bairro, e
                   mostrar apenas a menor faria o total do checkout parecer
                   engano. */
                <strong>
                  {moeda(Math.min(...taxas))} a {moeda(Math.max(...taxas))}
                </strong>
              )}
            </span>
            <span style={{ color: paleta.suave }}>
              {resumoDosPagamentos(formasOferecidas(loja))}
            </span>
          </div>

          {/* Linha própria, e não um chip ao lado do nome: espremido ali ele
              truncava o nome da loja, e a identidade não perde para um atalho
              que a maioria nunca usa. Só existe para quem já pediu neste
              aparelho. */}
          {pedidos.length > 0 && (
            <Link
              href={`/pedir/${slug}/pedidos`}
              className="mt-2 flex items-center gap-1.5 text-sm font-medium"
              style={{ color: loja.corDaMarca }}
            >
              <Receipt className="size-4 shrink-0" aria-hidden="true" />
              Meus pedidos
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </header>

        {hidratado && !situacao.aberta && (
          <p
            className="mx-4 mb-3 rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: paleta.superficie }}
          >
            {situacao.texto}. Dá para ver o cardápio, mas só dá para pedir quando ela abrir.
          </p>
        )}

        {/* Grudada no topo: em cardápio longo, é ela que evita a rolagem
            infinita até achar bebida. */}
        <BarraDeCategorias secoes={categorias} paleta={paleta} corDaMarca={loja.corDaMarca} />

        <main className={itens > 0 ? 'pb-24' : 'pb-10'}>
          {secoes.map(({ categoria, produtos }) => (
            <section key={categoria.id} id={`secao-${categoria.id}`} className="scroll-mt-14">
              <h2 className="px-4 pt-5 pb-2 text-base font-bold" style={{ color: loja.corDaMarca }}>
                {categoria.nome}
              </h2>

              {produtos.map((produto) => {
                const quantidade = naSacola.get(produto.id) ?? 0;
                return (
                  <button
                    key={produto.id}
                    type="button"
                    onClick={() => setAberto(produto)}
                    className={`${estilos['entradaDaLinha']} flex w-full items-start gap-3 border-b px-4 py-3 text-left`}
                    style={
                      {
                        borderColor: paleta.linha,
                        '--ordem': Math.min(ordem.get(produto.id) ?? 0, TETO_DA_CASCATA),
                      } as CSSProperties
                    }
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
                            <span
                              className="text-[13px] font-normal"
                              style={{ color: paleta.suave }}
                            >
                              a partir de{' '}
                            </span>
                            {moeda(Math.min(...produto.tamanhos.map((t) => t.preco)))}
                          </>
                        ) : (
                          moeda(produto.precoUnico ?? 0)
                        )}
                      </span>
                    </span>

                    <span className="relative shrink-0">
                      {/* Miniatura à direita, e um bloco discreto quando não há
                          foto: produto sem imagem continua uma linha legível em
                          vez de virar um buraco cinza no meio do cardápio. */}
                      <span
                        className="flex size-[76px] items-center justify-center overflow-hidden rounded-lg"
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

                      {/* Quanto deste produto já está na sacola. É o retorno que
                          fica: o voo passa em meio segundo, o selo continua ali
                          enquanto o cliente segue escolhendo. */}
                      <AnimatePresence initial={false}>
                        {quantidade > 0 && (
                          <m.span
                            key="selo"
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ duration: DURACAO.instante, ease: CURVA_ENTRADA }}
                            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold shadow-sm"
                            style={{
                              backgroundColor: loja.corDeAcao,
                              color: textoSobre(loja.corDeAcao),
                            }}
                          >
                            <NumeroRolante valor={quantidade} />
                            <span className="sr-only"> na sacola</span>
                          </m.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

          {secoes.length === 0 && (
            <p className="px-4 py-16 text-center text-sm" style={{ color: paleta.suave }}>
              Esta loja ainda não publicou nenhum produto.
            </p>
          )}
        </main>
      </div>

      {/* Barra da sacola só existe quando há sacola. Uma barra vazia fixa rouba
          altura de tela no celular sem dizer nada. */}
      <AnimatePresence>
        {itens > 0 && (
          <BarraDaSacola
            key="barra"
            ref={barra}
            itens={itens}
            total={total}
            corDeAcao={loja.corDeAcao}
            onAbrir={() => setSacolaAberta(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aberto && (
          <FolhaDoProduto
            key={aberto.id}
            produto={aberto}
            paleta={paleta}
            corDeAcao={loja.corDeAcao}
            aberta={situacao.aberta}
            onFechar={() => setAberto(null)}
            onAdicionar={adicionar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sacolaAberta && itens > 0 && (
          <FolhaDaSacola
            key="sacola"
            itens={carrinho}
            total={total}
            slug={slug}
            paleta={paleta}
            corDeAcao={loja.corDeAcao}
            onAjustar={ajustar}
            onFechar={() => setSacolaAberta(false)}
          />
        )}
      </AnimatePresence>

      {voo && (
        <VooParaASacola
          key={voo.id}
          de={voo.de}
          alvo={medirAlvo}
          rotulo={voo.rotulo}
          cor={loja.corDeAcao}
          onChegou={aoChegar}
        />
      )}
    </div>
  );
}
