'use client';

import Link, { useLinkStatus } from 'next/link';
import { Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { assinaturaDoItem } from './armazenamento';
import { FolhaDeBaixo } from './folha-de-baixo';
import type { ItemEscolhido } from './folha-do-produto';
import { CURVA_ENTRADA, CURVA_SAIDA, DURACAO } from './movimento';
import { NumeroRolante } from './numero-rolante';
import { moeda, textoSobre, type Paleta } from './paleta';
import { SeloDePromocao } from './selo-de-promocao';
import type { LinhaDaSacola } from '@/lib/loja-promocoes';

/**
 * O texto do botão "Continuar", que troca por "Abrindo…" no toque.
 *
 * `useLinkStatus` só enxerga o `<Link>` que o contém, por isso é um componente
 * à parte, filho do link. O toque já é a resposta ao cliente: sem isto o botão
 * ficava igual até a próxima tela chegar, e num 4G fraco parecia que o toque
 * não tinha pegado — e o cliente tocava de novo.
 */
function RotuloDoContinuar() {
  const { pending } = useLinkStatus();
  if (!pending) return <>Continuar</>;
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      Abrindo…
    </span>
  );
}

/**
 * A sacola aberta por cima do cardápio, sem sair dele.
 *
 * O ganho é poder conferir e ajustar — tirar um, pôr mais um — e voltar a
 * escolher, sem ir e voltar de página. O custo é um toque a mais antes do
 * checkout; é o mesmo desenho do iFood, e quem pede em app de entrega já espera
 * esse passo.
 *
 * O checkout continua sendo a página `/sacola`: formulário de endereço e
 * pagamento dentro de uma folha seria rolagem sobre rolagem, e o teclado do
 * celular cobriria metade dela.
 */
export function FolhaDaSacola({
  itens,
  linhas,
  podeAumentar,
  avisos,
  total,
  slug,
  paleta,
  corDeAcao,
  onAjustar,
  onFechar,
}: {
  itens: ItemEscolhido[];
  /** O que cada item custa com as promoções, na ordem de `itens`. */
  linhas: LinhaDaSacola[];
  /** Na ordem de `itens`: ainda cabe mais uma unidade (o estoque curto do produto não deixa passar). */
  podeAumentar: boolean[];
  /** Na ordem de `itens`: o que o estoque não sustenta mais (esgotou, ou sobrou menos), ou `null`. */
  avisos: Array<string | null>;
  total: number;
  slug: string;
  paleta: Paleta;
  corDeAcao: string;
  onAjustar: (indice: number, passo: number) => void;
  onFechar: () => void;
}) {
  return (
    <FolhaDeBaixo
      rotulo="Sua sacola"
      paleta={paleta}
      onFechar={onFechar}
      cabecalho={
        <div
          className="flex items-center justify-between gap-3 border-b px-4 pt-1 pb-3"
          style={{ borderColor: paleta.linha }}
        >
          <h2 className="text-lg font-semibold">Sua sacola</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-1 rounded-full p-2"
            style={{ color: paleta.suave }}
          >
            <X className="size-5" />
          </button>
        </div>
      }
      rodape={
        <div className="border-t px-4 py-3" style={{ borderColor: paleta.linha }}>
          <div className="mb-3 flex items-baseline justify-between text-sm">
            <span style={{ color: paleta.suave }}>Subtotal, sem a entrega</span>
            <span className="text-base font-semibold">
              <NumeroRolante valor={total} formatar={moeda} />
            </span>
          </div>
          <Link
            href={`/pedir/${slug}/sacola`}
            className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold"
            style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
          >
            <RotuloDoContinuar />
          </Link>
        </div>
      }
    >
      <ul>
        {/* `initial={false}`: ao abrir a folha, as linhas já estão lá — quem
            anima é a folha subindo. A lista só anima o que muda depois. */}
        <AnimatePresence initial={false}>
          {itens.map((item, indice) => (
            <m.li
              // A assinatura, e não o índice: quando uma linha sai, as de baixo
              // mudam de índice, e a animação de saída rodaria na errada.
              key={assinaturaDoItem(item)}
              layout
              exit={{
                opacity: 0,
                height: 0,
                transition: { duration: DURACAO.curta, ease: CURVA_SAIDA },
              }}
              transition={{ duration: DURACAO.curta, ease: CURVA_ENTRADA }}
              className="overflow-hidden border-b"
              style={{ borderColor: paleta.linha }}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">
                    {item.nome}
                    {item.tamanho && ` · ${item.tamanho}`}
                  </p>
                  {item.inclui && (
                    <p className="mt-0.5 text-[13px]" style={{ color: paleta.suave }}>
                      Inclui: {item.inclui}
                    </p>
                  )}
                  {item.escolhas.length > 0 && (
                    <p className="mt-0.5 text-[13px]" style={{ color: paleta.suave }}>
                      {item.escolhas.join(', ')}
                    </p>
                  )}
                  {avisos[indice] && (
                    <p className="mt-1 text-[13px] font-medium" style={{ color: paleta.erro }}>
                      {avisos[indice]}
                    </p>
                  )}
                  <p className="mt-1 text-[15px] font-semibold">
                    {linhas[indice]?.promocao && (
                      <s className="mr-1.5 text-[13px] font-normal" style={{ color: paleta.suave }}>
                        {moeda(linhas[indice]?.original ?? 0)}
                      </s>
                    )}
                    <NumeroRolante
                      valor={linhas[indice]?.total ?? item.unitario * item.quantidade}
                      formatar={moeda}
                    />
                  </p>
                  {linhas[indice]?.promocao && (
                    <p className="mt-1">
                      <SeloDePromocao
                        rotulo={linhas[indice].promocao.rotulo}
                        corDeAcao={corDeAcao}
                      />
                    </p>
                  )}
                </div>

                <div
                  className="flex shrink-0 items-center gap-1 rounded-full border"
                  style={{ borderColor: paleta.linha }}
                >
                  <button
                    type="button"
                    aria-label={
                      item.quantidade === 1 ? `Tirar ${item.nome}` : `Menos um ${item.nome}`
                    }
                    onClick={() => onAjustar(indice, -1)}
                    className="rounded-full p-2"
                  >
                    {item.quantidade === 1 ? (
                      <Trash2 className="size-4" />
                    ) : (
                      <Minus className="size-4" />
                    )}
                  </button>
                  <span className="w-4 text-center text-sm font-medium">
                    <NumeroRolante valor={item.quantidade} />
                  </span>
                  <button
                    type="button"
                    aria-label={`Mais um ${item.nome}`}
                    disabled={!(podeAumentar[indice] ?? true)}
                    onClick={() => onAjustar(indice, 1)}
                    className="rounded-full p-2"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </FolhaDeBaixo>
  );
}
