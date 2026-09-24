'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { LOJA_DE_EXEMPLO, situacaoDaLoja, type EnderecoDaEntrega } from '@/lib/loja-mock';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import {
  clienteSalvo,
  guardarPedido,
  proximoNumero,
  useHidratado,
  useSacola,
} from '@/components/loja-online/armazenamento';
import { PorteiraDeLogin, useConta } from '@/components/loja-online/conta';

/**
 * Sacola e checkout na MESMA página.
 *
 * Separar em duas etapas acrescenta um toque e uma tela a quem já decidiu
 * comprar. O cliente confere o que escolheu e preenche a entrega rolando para
 * baixo, sem perder de vista o que está levando.
 */

const ENDERECO_VAZIO: EnderecoDaEntrega = {
  rua: '',
  numero: '',
  complemento: null,
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  referencia: null,
};

/**
 * A casca espera DUAS coisas antes de montar o conteúdo: a hidratação do React
 * e o carregamento do Clerk.
 *
 * Não é enfeite. Os campos precisam NASCER preenchidos com o endereço que está
 * na conta, e `useState` só olha o valor inicial na primeira renderização. Se
 * o conteúdo montar antes de o Clerk dizer quem é, essa primeira renderização
 * não tem conta, não acha endereço nenhum, e o formulário nasce vazio para
 * sempre — mesmo com o endereço salvo ali do lado.
 */
export default function SacolaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const loja = LOJA_DE_EXEMPLO;
  const paleta = paletaDoTema(loja.tema);
  const hidratado = useHidratado();
  const conta = useConta();

  if (!hidratado || !conta.carregada) {
    return (
      <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
        <div className="h-1" style={{ backgroundColor: loja.corDaMarca }} />
      </div>
    );
  }

  return <Conteudo slug={slug} usuarioId={conta.usuarioId} />;
}

function Conteudo({ slug, usuarioId }: { slug: string; usuarioId: string | null }) {
  const router = useRouter();
  const loja = LOJA_DE_EXEMPLO;
  const paleta = paletaDoTema(loja.tema);

  const { itens, setItens } = useSacola(slug);

  // O endereço vem da CONTA, e não do aparelho. É a mesma ideia do "salvar
  // cliente" do painel, vista do outro lado: os dados já existem, só faltava
  // alguém reaproveitá-los.
  const anterior = useMemo(
    () => (usuarioId === null ? null : clienteSalvo(slug, usuarioId)),
    [slug, usuarioId],
  );

  const [nome, setNome] = useState(anterior?.nome ?? '');
  const [telefone, setTelefone] = useState(anterior?.telefone ?? '');
  const [entrega, setEntrega] = useState<EnderecoDaEntrega>(anterior?.entrega ?? ENDERECO_VAZIO);
  const [pagamento, setPagamento] = useState(loja.pagamentos[0] ?? '');
  const [trocoPara, setTrocoPara] = useState('');
  const [observacao, setObservacao] = useState('');
  const [retirar, setRetirar] = useState(false);

  const situacao = situacaoDaLoja(loja, new Date());

  /*
   * O bairro vem de uma LISTA, e não de um campo livre.
   *
   * É ele que define a taxa, e é ele que limita a área: bairro fora da lista
   * simplesmente não é oferecido. Um campo de texto aqui aceitaria endereço a
   * quarenta quilômetros e a loja só descobriria com o motoboy na rua.
   */
  const bairroEscolhido = loja.bairros.find((bairro) => bairro.nome === entrega.bairro) ?? null;

  const subtotal = itens.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);
  // Retirada não tem entrega, logo não tem taxa: o cliente busca no balcão.
  const taxa = retirar ? 0 : (bairroEscolhido?.taxa ?? 0);
  const total = subtotal + taxa;
  const emDinheiro = pagamento.toLowerCase().includes('dinheiro');

  // O mínimo conta só os itens: somar a entrega faria a taxa ajudar a atingir
  // o mínimo, que é o contrário do que o mínimo existe para proteger.
  const faltaParaOMinimo =
    loja.pedidoMinimo !== null && subtotal < loja.pedidoMinimo ? loja.pedidoMinimo - subtotal : 0;

  const faltando: string[] = [];
  if (nome.trim() === '') faltando.push('seu nome');
  if (telefone.trim().length < 10) faltando.push('o telefone');
  // Na retirada o endereço não é pedido, então também não pode ser exigido.
  if (!retirar) {
    if (entrega.rua.trim() === '') faltando.push('a rua');
    if (entrega.numero.trim() === '') faltando.push('o número');
    if (bairroEscolhido === null) faltando.push('o bairro');
    if (entrega.cidade.trim() === '') faltando.push('a cidade');
  }

  function alterarQuantidade(indice: number, passo: number) {
    setItens((atual) =>
      atual
        .map((item, i) =>
          i === indice ? { ...item, quantidade: Math.max(0, item.quantidade + passo) } : item,
        )
        .filter((item) => item.quantidade > 0),
    );
  }

  function confirmar() {
    if (usuarioId === null) return;
    const numero = proximoNumero(slug, usuarioId);
    guardarPedido(slug, usuarioId, {
      numero,
      criadoEm: new Date().toISOString(),
      itens,
      subtotal,
      taxaDeEntrega: taxa,
      total,
      pagamento,
      trocoPara: emDinheiro && trocoPara.trim() !== '' ? Number(trocoPara.replace(',', '.')) : null,
      nome: nome.trim(),
      telefone: telefone.trim(),
      entrega,
      minutosDePreparo: loja.minutosDePreparo,
      observacao: observacao.trim() === '' ? null : observacao.trim(),
      retirarNaLoja: retirar,
    });
    setItens([]);
    router.push(`/pedir/${slug}/pedidos?novo=${numero}`);
  }

  const campo = {
    backgroundColor: paleta.fundo,
    borderColor: paleta.linha,
    color: paleta.texto,
  };

  return (
    <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
      <div className="h-1" style={{ backgroundColor: loja.corDaMarca }} />

      <div className="mx-auto w-full max-w-lg pb-28">
        <header
          className="flex items-center gap-2 border-b px-3 py-3"
          style={{ borderColor: paleta.linha }}
        >
          <Link href={`/pedir/${slug}`} aria-label="Voltar ao cardápio" className="-ml-1 p-1">
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-lg font-bold">Sua sacola</h1>
        </header>

        {itens.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm" style={{ color: paleta.suave }}>
              Sua sacola está vazia.
            </p>
            <Link
              href={`/pedir/${slug}`}
              className="mt-4 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold"
              style={{ backgroundColor: loja.corDeAcao, color: textoSobre(loja.corDeAcao) }}
            >
              Ver o cardápio
            </Link>
          </div>
        ) : (
          <>
            <section>
              {itens.map((item, indice) => (
                <div
                  key={`${item.produtoId}-${indice}`}
                  className="flex items-start gap-3 border-b px-4 py-3"
                  style={{ borderColor: paleta.linha }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">
                      {item.nome}
                      {item.tamanho && ` · ${item.tamanho}`}
                    </p>
                    {item.escolhas.length > 0 && (
                      <p className="mt-0.5 text-[13px]" style={{ color: paleta.suave }}>
                        {item.escolhas.join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-[15px] font-semibold">
                      {moeda(item.unitario * item.quantidade)}
                    </p>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-1 rounded-full border"
                    style={{ borderColor: paleta.linha }}
                  >
                    <button
                      type="button"
                      aria-label={`Menos um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, -1)}
                      className="rounded-full p-2"
                    >
                      {item.quantidade === 1 ? (
                        <Trash2 className="size-4" />
                      ) : (
                        <Minus className="size-4" />
                      )}
                    </button>
                    <span className="w-4 text-center text-sm font-medium">{item.quantidade}</span>
                    <button
                      type="button"
                      aria-label={`Mais um ${item.nome}`}
                      onClick={() => alterarQuantidade(indice, 1)}
                      className="rounded-full p-2"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="space-y-1 px-4 py-3 text-sm">
                <div className="flex justify-between" style={{ color: paleta.suave }}>
                  <span>Itens</span>
                  <span>{moeda(subtotal)}</span>
                </div>
                <div className="flex justify-between" style={{ color: paleta.suave }}>
                  <span>
                    {retirar
                      ? 'Retirada'
                      : `Entrega${bairroEscolhido ? ` · ${bairroEscolhido.nome}` : ''}`}
                  </span>
                  <span>
                    {retirar ? 'sem taxa' : bairroEscolhido ? moeda(taxa) : 'escolha o bairro'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span>{moeda(total)}</span>
                </div>
              </div>
            </section>

            {/* A loja exige conta para comprar. Ver o cardápio e montar a
                sacola não exige — a porteira fica aqui, no fim, e não na
                porta de entrada. */}
            {usuarioId === null ? (
              <PorteiraDeLogin
                paleta={paleta}
                corDeAcao={loja.corDeAcao}
                textoDoBotao="Entrar e continuar"
                resumo={`Sua sacola tem ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}, ${moeda(total)} com a entrega.`}
              />
            ) : (
              <>
                {/*
                 * Campos SEPARADOS, e não uma caixa de "endereço".
                 *
                 * É o formato que o cadastro de clientes do painel exige
                 * (`CompanyCustomerAddress`). Pedir tudo numa linha só deixaria a
                 * loja sem como salvar este cliente sem redigitar — que é a
                 * funcionalidade inteira indo embora por causa de um campo.
                 */}
                {/* A escolha vem ANTES do endereço: quem vai retirar não deve
                nem ver os campos que não vai preencher. */}
                {loja.aceitaRetirada && (
                  <section className="border-t pt-4" style={{ borderColor: paleta.linha }}>
                    <h2 className="px-4 pb-2 text-base font-bold">Como você quer receber</h2>
                    {[
                      { valor: false, titulo: 'Entrega', detalhe: 'Levamos até você.' },
                      { valor: true, titulo: 'Retirar na loja', detalhe: 'Sem taxa de entrega.' },
                    ].map((opcao) => (
                      <label
                        key={String(opcao.valor)}
                        className="flex items-center gap-3 border-b px-4 py-3 text-sm"
                        style={{ borderColor: paleta.linha }}
                      >
                        <input
                          type="radio"
                          name="recebimento"
                          className="size-4"
                          style={{ accentColor: loja.corDeAcao }}
                          checked={retirar === opcao.valor}
                          onChange={() => setRetirar(opcao.valor)}
                        />
                        <span>
                          {opcao.titulo}
                          <span className="block text-xs" style={{ color: paleta.suave }}>
                            {opcao.detalhe}
                          </span>
                        </span>
                      </label>
                    ))}

                    {retirar && (
                      <p className="px-4 pt-3 text-sm">
                        Retire em{' '}
                        <strong>
                          {loja.pontoDeColeta.rua}, {loja.pontoDeColeta.numero}
                        </strong>
                        <span className="block text-xs" style={{ color: paleta.suave }}>
                          {loja.pontoDeColeta.bairro}, {loja.pontoDeColeta.cidade}/
                          {loja.pontoDeColeta.estado}
                        </span>
                      </p>
                    )}
                  </section>
                )}

                <section
                  className={retirar ? 'hidden' : 'border-t pt-4'}
                  style={{ borderColor: paleta.linha }}
                >
                  <h2 className="px-4 pb-2 text-base font-bold">Entrega</h2>
                  <div className="space-y-3 px-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Campo
                        id="nome"
                        rotulo="Seu nome"
                        valor={nome}
                        aoMudar={setNome}
                        estilo={campo}
                        paleta={paleta}
                        className="col-span-2"
                      />
                      <Campo
                        id="telefone"
                        rotulo="Telefone"
                        valor={telefone}
                        aoMudar={setTelefone}
                        estilo={campo}
                        paleta={paleta}
                        inputMode="tel"
                        dica="É por ele que o motoboy liga se não achar o endereço."
                        className="col-span-2"
                      />
                      <Campo
                        id="rua"
                        rotulo="Rua"
                        valor={entrega.rua}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, rua: v }))}
                        estilo={campo}
                        paleta={paleta}
                        className="col-span-2"
                      />
                      <Campo
                        id="numero"
                        rotulo="Número"
                        valor={entrega.numero}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, numero: v }))}
                        estilo={campo}
                        paleta={paleta}
                      />
                      <Campo
                        id="complemento"
                        rotulo="Complemento"
                        valor={entrega.complemento ?? ''}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, complemento: v || null }))}
                        estilo={campo}
                        paleta={paleta}
                      />
                      {/* Lista, e não campo livre: o bairro define a taxa e
                          delimita a área que a loja atende. */}
                      <div className="col-span-2">
                        <label htmlFor="bairro" className="mb-1 block text-xs font-medium">
                          Bairro
                        </label>
                        <select
                          id="bairro"
                          value={entrega.bairro}
                          onChange={(evento) =>
                            setEntrega((e) => ({ ...e, bairro: evento.target.value }))
                          }
                          className="h-11 w-full rounded-lg border px-3 text-sm"
                          style={campo}
                        >
                          <option value="">Escolha o bairro</option>
                          {loja.bairros.map((bairro) => (
                            <option key={bairro.id} value={bairro.nome}>
                              {bairro.nome} — {moeda(bairro.taxa)}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs" style={{ color: paleta.suave }}>
                          {loja.bairros.length === 0
                            ? 'Esta loja ainda não cadastrou bairros de entrega.'
                            : 'Não achou o seu? A loja não entrega nele por enquanto.'}
                        </p>
                      </div>

                      <Campo
                        id="cidade"
                        rotulo="Cidade"
                        valor={entrega.cidade}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, cidade: v }))}
                        estilo={campo}
                        paleta={paleta}
                      />
                      <Campo
                        id="estado"
                        rotulo="Estado"
                        valor={entrega.estado}
                        aoMudar={(v) =>
                          setEntrega((e) => ({ ...e, estado: v.toUpperCase().slice(0, 2) }))
                        }
                        estilo={campo}
                        paleta={paleta}
                      />
                      <Campo
                        id="cep"
                        rotulo="CEP"
                        valor={entrega.cep}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, cep: v }))}
                        estilo={campo}
                        paleta={paleta}
                        inputMode="numeric"
                        className="col-span-2"
                      />
                      <Campo
                        id="referencia"
                        rotulo="Ponto de referência"
                        valor={entrega.referencia ?? ''}
                        aoMudar={(v) => setEntrega((e) => ({ ...e, referencia: v || null }))}
                        estilo={campo}
                        paleta={paleta}
                        dica="Portão, cor da casa, o que ajudar a achar."
                        className="col-span-2"
                      />
                    </div>
                  </div>
                </section>

                <section className="mt-4 border-t pt-4" style={{ borderColor: paleta.linha }}>
                  <h2 className="px-4 pb-2 text-base font-bold">Pagamento</h2>
                  {loja.pagamentos.map((forma) => (
                    <label
                      key={forma}
                      className="flex items-center gap-3 border-b px-4 py-3 text-sm"
                      style={{ borderColor: paleta.linha }}
                    >
                      <input
                        type="radio"
                        name="pagamento"
                        className="size-4"
                        style={{ accentColor: loja.corDeAcao }}
                        checked={pagamento === forma}
                        onChange={() => setPagamento(forma)}
                      />
                      <span>{forma}</span>
                    </label>
                  ))}

                  {/* Troco perguntado aqui, e não na porta: é o que o motoboy
                  precisa levar na mão, e ele sai antes de alguém ligar. */}
                  {/* O que o cliente escreve tem que caber em algum lugar, senão
                      vira ligação para a loja — ou pedido errado. */}
                  <div className="px-4 pt-3">
                    <label htmlFor="observacao" className="mb-1 block text-xs font-medium">
                      Alguma observação?
                    </label>
                    <textarea
                      id="observacao"
                      value={observacao}
                      onChange={(evento) => setObservacao(evento.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="Sem cebola, troca o refri por suco, apartamento no fundo…"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={campo}
                    />
                  </div>

                  {emDinheiro && (
                    <div className="px-4 pt-3">
                      <Campo
                        id="troco"
                        rotulo="Precisa de troco para quanto?"
                        valor={trocoPara}
                        aoMudar={setTrocoPara}
                        estilo={campo}
                        paleta={paleta}
                        inputMode="decimal"
                        dica="Deixe em branco se tiver o valor certo."
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {itens.length > 0 && usuarioId !== null && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t p-3"
          style={{ backgroundColor: paleta.fundo, borderColor: paleta.linha }}
        >
          <div className="mx-auto max-w-lg">
            {/* O mínimo vem antes do resto: não adianta a pessoa preencher o
                endereço inteiro para descobrir no fim que falta R$ 9,00. */}
            {faltaParaOMinimo > 0 && (
              <p className="mb-2 text-xs font-medium">
                Pedido mínimo de {moeda(loja.pedidoMinimo ?? 0)} em itens. Faltam{' '}
                {moeda(faltaParaOMinimo)}.
              </p>
            )}
            {faltaParaOMinimo === 0 && faltando.length > 0 && (
              <p className="mb-2 text-xs" style={{ color: paleta.suave }}>
                Falta preencher: {faltando.join(', ')}.
              </p>
            )}
            <button
              type="button"
              disabled={!situacao.aberta || faltando.length > 0 || faltaParaOMinimo > 0}
              onClick={confirmar}
              className="flex h-13 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: loja.corDeAcao, color: textoSobre(loja.corDeAcao) }}
            >
              <span>{situacao.aberta ? 'Fazer pedido' : situacao.texto}</span>
              <span>{moeda(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  estilo,
  paleta,
  dica,
  inputMode,
  className,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  estilo: React.CSSProperties;
  paleta: { suave: string };
  dica?: string;
  inputMode?: 'tel' | 'numeric' | 'decimal';
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        inputMode={inputMode}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="h-11 w-full rounded-lg border px-3 text-sm"
        style={estilo}
      />
      {dica && (
        <p className="mt-1 text-xs" style={{ color: paleta.suave }}>
          {dica}
        </p>
      )}
    </div>
  );
}
