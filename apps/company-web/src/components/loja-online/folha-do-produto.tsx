'use client';

import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { GrupoDeExemplo, ProdutoDeExemplo, TamanhoDeExemplo } from '@/lib/loja-mock';
import { FolhaDeBaixo } from './folha-de-baixo';
import { moeda, textoSobre, type Paleta } from './paleta';

/**
 * Folha que sobe de baixo, e não caixa centralizada.
 *
 * A loja é aberta no celular, com uma mão. O que o polegar alcança é a parte
 * de baixo da tela, e é lá que ficam a quantidade e o botão de adicionar.
 *
 * O movimento (subir, descer, arrastar para fechar) vem de `FolhaDeBaixo`,
 * compartilhado com a sacola. Este componente só cuida do conteúdo.
 */

export interface ItemEscolhido {
  produtoId: string;
  nome: string;
  tamanho: string | null;
  escolhas: string[];
  quantidade: number;
  /** Preço unitário já com tamanho e escolhas somados. */
  unitario: number;
}

/** A regra do grupo na língua do cliente, e não em mínimo/máximo. */
function regraDoGrupo(grupo: GrupoDeExemplo): { texto: string; obrigatorio: boolean } {
  const { minimo, maximo } = grupo;
  if (minimo >= 1) {
    if (maximo === minimo) return { texto: `Escolha ${minimo}`, obrigatorio: true };
    if (maximo === null) return { texto: `Escolha ao menos ${minimo}`, obrigatorio: true };
    return { texto: `Escolha de ${minimo} a ${maximo}`, obrigatorio: true };
  }
  if (maximo === 1) return { texto: 'Escolha 1, se quiser', obrigatorio: false };
  if (maximo === null) return { texto: 'Quantos quiser', obrigatorio: false };
  return { texto: `Até ${maximo}`, obrigatorio: false };
}

export function FolhaDoProduto({
  produto,
  paleta,
  corDeAcao,
  aberta,
  rotuloFechada = 'Loja fechada',
  onFechar,
  onAdicionar,
}: {
  produto: ProdutoDeExemplo;
  paleta: Paleta;
  corDeAcao: string;
  /** Loja fechada: dá para olhar o cardápio, não dá para pedir. */
  aberta: boolean;
  /** O que o botão diz quando não dá para pedir. */
  rotuloFechada?: string;
  onFechar: () => void;
  /**
   * `origem` é onde estava o botão no instante do toque, para a animação do
   * item voando até a sacola saber de onde partir. Não interfere no que entra
   * na sacola — é só a coordenada de uma animação.
   */
  onAdicionar: (item: ItemEscolhido, origem: DOMRect | null) => void;
}) {
  const disponiveis = produto.tamanhos.filter((tamanho) => tamanho.disponivel);
  const [tamanhoId, setTamanhoId] = useState<string | null>(disponiveis[0]?.id ?? null);
  const [marcadas, setMarcadas] = useState<Record<string, string[]>>({});
  const [quantidade, setQuantidade] = useState(1);

  const tamanho: TamanhoDeExemplo | undefined = produto.tamanhos.find(
    (item) => item.id === tamanhoId,
  );
  const base = tamanho ? tamanho.preco : (produto.precoUnico ?? 0);

  const escolhidas = produto.grupos.flatMap((grupo) =>
    grupo.escolhas.filter((escolha) => (marcadas[grupo.id] ?? []).includes(escolha.id)),
  );
  const unitario = base + escolhidas.reduce((soma, escolha) => soma + escolha.preco, 0);

  /*
   * O mesmo mínimo que o painel verifica, aqui do lado de quem compra. Se um
   * grupo obrigatório não for atendido, o botão não libera — e a tela diz qual
   * grupo falta, em vez de só ficar cinza.
   */
  const faltando = produto.grupos.filter(
    (grupo) => grupo.minimo >= 1 && (marcadas[grupo.id] ?? []).length < grupo.minimo,
  );

  function alternar(grupo: GrupoDeExemplo, escolhaId: string) {
    setMarcadas((atual) => {
      const agora = atual[grupo.id] ?? [];
      if (agora.includes(escolhaId)) {
        return { ...atual, [grupo.id]: agora.filter((item) => item !== escolhaId) };
      }
      // Máximo 1 troca a escolha em vez de recusar o toque: recusar faria o
      // cliente desmarcar antes de marcar, sem nada na tela explicando.
      if (grupo.maximo === 1) return { ...atual, [grupo.id]: [escolhaId] };
      if (grupo.maximo !== null && agora.length >= grupo.maximo) return atual;
      return { ...atual, [grupo.id]: [...agora, escolhaId] };
    });
  }

  return (
    <FolhaDeBaixo
      rotulo={produto.nome}
      paleta={paleta}
      onFechar={onFechar}
      cabecalho={
        <div
          className="flex items-start gap-3 border-b px-4 pt-1 pb-3"
          style={{ borderColor: paleta.linha }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-tight font-semibold">{produto.nome}</h2>
            {produto.descricao && (
              <p className="mt-1 text-sm" style={{ color: paleta.suave }}>
                {produto.descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mt-1 -mr-1 shrink-0 rounded-full p-2"
            style={{ color: paleta.suave }}
          >
            <X className="size-5" />
          </button>
        </div>
      }
      rodape={
        <div className="border-t px-4 py-3" style={{ borderColor: paleta.linha }}>
          {faltando.length > 0 && (
            <p className="mb-2 text-xs" style={{ color: paleta.suave }}>
              Falta escolher: {faltando.map((grupo) => grupo.nome).join(', ')}.
            </p>
          )}

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1 rounded-full border"
              style={{ borderColor: paleta.linha }}
            >
              <button
                type="button"
                aria-label="Menos um"
                disabled={quantidade <= 1}
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                className="rounded-full p-2 disabled:opacity-35"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-5 text-center text-sm font-medium">{quantidade}</span>
              <button
                type="button"
                aria-label="Mais um"
                onClick={() => setQuantidade((q) => q + 1)}
                className="rounded-full p-2"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!aberta || faltando.length > 0}
              onClick={(evento) =>
                onAdicionar(
                  {
                    produtoId: produto.id,
                    nome: produto.nome,
                    tamanho: tamanho?.nome ?? null,
                    escolhas: escolhidas.map((escolha) => escolha.nome),
                    quantidade,
                    unitario,
                  },
                  evento.currentTarget.getBoundingClientRect(),
                )
              }
              className="flex h-12 flex-1 items-center justify-between rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
            >
              <span>{aberta ? 'Adicionar' : rotuloFechada}</span>
              <span>{moeda(unitario * quantidade)}</span>
            </button>
          </div>
        </div>
      }
    >
      {disponiveis.length > 0 && (
        <section>
          <SecaoTitulo paleta={paleta} titulo="Tamanho" regra="Escolha 1" obrigatorio />
          {produto.tamanhos.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 border-b px-4 py-3 text-sm"
              style={{
                borderColor: paleta.linha,
                opacity: item.disponivel ? 1 : 0.45,
              }}
            >
              <input
                type="radio"
                name="tamanho"
                className="size-4 shrink-0"
                style={{ accentColor: corDeAcao }}
                checked={tamanhoId === item.id}
                disabled={!item.disponivel}
                onChange={() => setTamanhoId(item.id)}
              />
              <span className="flex-1">{item.nome}</span>
              <span style={{ color: paleta.suave }}>
                {item.disponivel ? moeda(item.preco) : 'Indisponível'}
              </span>
            </label>
          ))}
        </section>
      )}

      {produto.grupos.map((grupo) => {
        const regra = regraDoGrupo(grupo);
        const agora = marcadas[grupo.id] ?? [];
        const cheio = grupo.maximo !== null && grupo.maximo > 1 && agora.length >= grupo.maximo;

        return (
          <section key={grupo.id}>
            <SecaoTitulo
              paleta={paleta}
              titulo={grupo.nome}
              regra={regra.texto}
              obrigatorio={regra.obrigatorio}
            />
            {grupo.escolhas.map((escolha) => {
              const marcada = agora.includes(escolha.id);
              const travada = !escolha.disponivel || (cheio && !marcada);

              return (
                <label
                  key={escolha.id}
                  className="flex items-center gap-3 border-b px-4 py-3 text-sm"
                  style={{
                    borderColor: paleta.linha,
                    opacity: escolha.disponivel ? 1 : 0.45,
                  }}
                >
                  <input
                    type={grupo.maximo === 1 ? 'radio' : 'checkbox'}
                    name={grupo.maximo === 1 ? `grupo-${grupo.id}` : undefined}
                    className="size-4 shrink-0"
                    style={{ accentColor: corDeAcao }}
                    checked={marcada}
                    disabled={travada}
                    onChange={() => alternar(grupo, escolha.id)}
                  />
                  <span className="flex-1">{escolha.nome}</span>
                  <span style={{ color: paleta.suave }}>
                    {!escolha.disponivel
                      ? 'Indisponível'
                      : escolha.preco > 0
                        ? `+ ${moeda(escolha.preco)}`
                        : ''}
                  </span>
                </label>
              );
            })}
          </section>
        );
      })}
    </FolhaDeBaixo>
  );
}

function SecaoTitulo({
  paleta,
  titulo,
  regra,
  obrigatorio,
}: {
  paleta: Paleta;
  titulo: string;
  regra: string;
  obrigatorio: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2"
      style={{ backgroundColor: paleta.superficie }}
    >
      <span className="text-sm font-semibold">{titulo}</span>
      <span className="text-xs" style={{ color: paleta.suave }}>
        {obrigatorio ? <strong style={{ color: paleta.texto }}>{regra}</strong> : regra}
      </span>
    </div>
  );
}
