'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { LOJA_DE_EXEMPLO, type EnderecoDaEntrega } from '@/lib/loja-mock';
import { moeda, paletaDoTema, textoSobre } from '@/components/loja-online/paleta';
import {
  guardarPedido,
  proximoNumero,
  ultimoCliente,
  useHidratado,
  useSacola,
} from '@/components/loja-online/armazenamento';

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
  cidade: '',
  estado: '',
  cep: '',
  referencia: null,
};

/**
 * A casca espera a hidratação antes de montar o conteúdo.
 *
 * Não é enfeite: os campos precisam NASCER preenchidos com o endereço do
 * pedido anterior. Preenchê-los depois, por efeito, é uma renderização em
 * cascata — e o servidor, que não vê o aparelho, mandaria campos vazios que
 * piscariam antes de serem trocados.
 */
export default function SacolaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const loja = LOJA_DE_EXEMPLO;
  const paleta = paletaDoTema(loja.tema);
  const hidratado = useHidratado();

  if (!hidratado) {
    return (
      <div className="min-h-dvh" style={{ backgroundColor: paleta.fundo, color: paleta.texto }}>
        <div className="h-1" style={{ backgroundColor: loja.corDaMarca }} />
      </div>
    );
  }

  return <Conteudo slug={slug} />;
}

function Conteudo({ slug }: { slug: string }) {
  const router = useRouter();
  const loja = LOJA_DE_EXEMPLO;
  const paleta = paletaDoTema(loja.tema);

  const { itens, setItens } = useSacola(slug);

  // Quem já pediu nesta loja não redigita endereço. É a mesma ideia do "salvar
  // cliente" do painel, vista do outro lado: os dados já existem, só faltava
  // alguém reaproveitá-los.
  const anterior = useMemo(() => ultimoCliente(slug), [slug]);

  const [nome, setNome] = useState(anterior?.nome ?? '');
  const [telefone, setTelefone] = useState(anterior?.telefone ?? '');
  const [entrega, setEntrega] = useState<EnderecoDaEntrega>(anterior?.entrega ?? ENDERECO_VAZIO);
  const [pagamento, setPagamento] = useState(loja.pagamentos[0] ?? '');
  const [trocoPara, setTrocoPara] = useState('');

  const subtotal = itens.reduce((soma, item) => soma + item.unitario * item.quantidade, 0);
  const taxa = loja.taxaDeEntrega ?? 0;
  const total = subtotal + taxa;
  const emDinheiro = pagamento.toLowerCase().includes('dinheiro');

  const faltando: string[] = [];
  if (nome.trim() === '') faltando.push('seu nome');
  if (telefone.trim().length < 10) faltando.push('o telefone');
  if (entrega.rua.trim() === '') faltando.push('a rua');
  if (entrega.numero.trim() === '') faltando.push('o número');
  if (entrega.cidade.trim() === '') faltando.push('a cidade');

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
    const numero = proximoNumero(slug);
    guardarPedido(slug, {
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
                  <span>Entrega</span>
                  <span>{taxa > 0 ? moeda(taxa) : 'a combinar'}</span>
                </div>
                <div className="flex justify-between pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span>{moeda(total)}</span>
                </div>
              </div>
            </section>

            {/*
             * Campos SEPARADOS, e não uma caixa de "endereço".
             *
             * É o formato que o cadastro de clientes do painel exige
             * (`CompanyCustomerAddress`). Pedir tudo numa linha só deixaria a
             * loja sem como salvar este cliente sem redigitar — que é a
             * funcionalidade inteira indo embora por causa de um campo.
             */}
            <section className="border-t pt-4" style={{ borderColor: paleta.linha }}>
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
      </div>

      {itens.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t p-3"
          style={{ backgroundColor: paleta.fundo, borderColor: paleta.linha }}
        >
          <div className="mx-auto max-w-lg">
            {faltando.length > 0 && (
              <p className="mb-2 text-xs" style={{ color: paleta.suave }}>
                Falta preencher: {faltando.join(', ')}.
              </p>
            )}
            <button
              type="button"
              disabled={!loja.aberta || faltando.length > 0}
              onClick={confirmar}
              className="flex h-13 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: loja.corDeAcao, color: textoSobre(loja.corDeAcao) }}
            >
              <span>{loja.aberta ? 'Fazer pedido' : 'Loja fechada'}</span>
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
