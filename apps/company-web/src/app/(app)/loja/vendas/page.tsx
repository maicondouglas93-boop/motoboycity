'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageSquare,
  Phone,
  Store,
  Timer,
  UserPlus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  VENDAS_DE_EXEMPLO,
  enderecoEmLinha,
  type CadastroDoCliente,
  type VendaDeExemplo,
} from '@/lib/loja-mock';

/**
 * O que a tela oferece para cada situação do cadastro. Três, e não um botão
 * só: quem já é cliente mas pediu de um endereço novo precisa que o ENDEREÇO
 * seja salvo, e não que um cliente duplicado seja criado.
 */
const CADASTRO: Record<CadastroDoCliente, { texto: string; acao: string | null }> = {
  novo: {
    texto: 'Este telefone não está no seu cadastro de clientes.',
    acao: 'Salvar cliente',
  },
  jaCadastrado: {
    texto: 'Já é seu cliente, e este endereço já está salvo nele.',
    acao: null,
  },
  enderecoNovo: {
    texto: 'Já é seu cliente, mas pediu de um endereço que não está salvo.',
    acao: 'Salvar este endereço no cliente',
  },
};

/**
 * As situações usam as mesmas palavras do painel de pedidos que a loja já
 * conhece. Inventar vocabulário novo para a venda online obrigaria o mesmo
 * atendente a aprender duas linguagens para a mesma operação.
 */
const SITUACOES: Record<VendaDeExemplo['situacao'], { texto: string; classe: string }> = {
  agendado: { texto: 'Aguardando preparo', classe: 'bg-sky-500/10 text-sky-700' },
  // (no modo manual este rótulo vira "Aguardando confirmação", no cartão e no filtro)
  preparo: { texto: 'Em preparo', classe: 'bg-amber-500/10 text-amber-700' },
  rota: { texto: 'Em rota', classe: 'bg-violet-500/10 text-violet-700' },
  entregue: { texto: 'Entregue', classe: 'bg-emerald-500/10 text-emerald-700' },
  cancelado: { texto: 'Cancelado', classe: 'bg-destructive/10 text-destructive' },
};

/**
 * O rótulo de `agendado` acompanha o modo de entrada, senão o filtro diz
 * "aguardando preparo" enquanto o cartão logo abaixo diz "aguardando
 * confirmação" — duas palavras para o mesmo estado, na mesma tela.
 */
function filtrosDaTela(
  entradaAutomatica: boolean,
): Array<{ valor: '' | VendaDeExemplo['situacao']; texto: string }> {
  return [
    { valor: '', texto: 'Todas' },
    {
      valor: 'agendado',
      texto: entradaAutomatica ? 'Aguardando preparo' : 'Aguardando confirmação',
    },
    { valor: 'preparo', texto: 'Em preparo' },
    { valor: 'rota', texto: 'Em rota' },
    { valor: 'entregue', texto: 'Entregues' },
  ];
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function LojaVendasPage() {
  const [filtro, setFiltro] = useState<'' | VendaDeExemplo['situacao']>('');
  const [aberta, setAberta] = useState<string | null>(null);

  /**
   * Espelha o checkbox de Configurações. Aqui é um controle de demonstração
   * porque as duas telas não compartilham estado sem backend — e sem ele não
   * haveria como conferir o modo manual, que é justamente o que muda a tela.
   */
  const [entradaAutomatica, setEntradaAutomatica] = useState(true);

  const lista = useMemo(
    () => VENDAS_DE_EXEMPLO.filter((venda) => !filtro || venda.situacao === filtro),
    [filtro],
  );

  const validas = VENDAS_DE_EXEMPLO.filter((venda) => venda.situacao !== 'cancelado');
  const total = validas.reduce((soma, venda) => soma + venda.total, 0);
  const aguardando = VENDAS_DE_EXEMPLO.filter((venda) => venda.situacao === 'agendado');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Vendas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos que chegaram pela página da sua loja.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="space-y-3 py-3">
          <p className="text-xs text-muted-foreground">
            Tela de demonstração. As vendas abaixo são exemplos — a página de pedidos da loja ainda
            não existe.
          </p>
          <label className="flex items-start gap-2.5 text-xs">
            <Checkbox
              className="mt-0.5"
              checked={entradaAutomatica}
              onCheckedChange={(valor) => setEntradaAutomatica(valor === true)}
            />
            <span>
              Aceitar pedidos automaticamente
              <span className="block text-muted-foreground">
                Na versão final isto vem de Configurações. Aqui fica na tela para o modo manual
                poder ser conferido — é ele que muda o que aparece abaixo.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* O aviso mais importante da tela.
          O pedido entra AGENDADO e vira entrega sozinho quando o preparo vence.
          A loja não precisa aprovar nada — precisa saber que tem uma janela
          para cancelar, e quanto dela ainda resta. */}
      {aguardando.length > 0 && (
        <Card
          className={
            entradaAutomatica
              ? 'border-sky-500/30 bg-sky-500/5'
              : 'border-amber-500/40 bg-amber-500/5'
          }
        >
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <Timer
              className={`size-4 shrink-0 ${entradaAutomatica ? 'text-sky-700' : 'text-amber-700'}`}
              aria-hidden="true"
            />
            {entradaAutomatica ? (
              <span>
                <strong>
                  {aguardando.length}{' '}
                  {aguardando.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'} preparo
                </strong>{' '}
                — o motoboy é chamado automaticamente quando o tempo acabar. Cancele antes disso se
                não for dar conta.
              </span>
            ) : (
              /* No modo manual não há contagem: nada anda até alguém confirmar,
                 e o cliente está esperando sem saber disso. */
              <span>
                <strong>
                  {aguardando.length}{' '}
                  {aguardando.length === 1
                    ? 'pedido esperando sua confirmação'
                    : 'pedidos esperando sua confirmação'}
                </strong>{' '}
                — nada anda até você confirmar, e o cliente já pediu. Não há contagem correndo aqui.
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Vendas hoje</p>
            <p className="mt-1 text-2xl font-bold">{validas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Total do dia</p>
            <p className="mt-1 text-2xl font-bold">{moeda(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="mt-1 text-2xl font-bold">
              {validas.length > 0 ? moeda(total / validas.length) : moeda(0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {filtrosDaTela(entradaAutomatica).map((item) => (
          <button
            key={item.valor || 'todas'}
            type="button"
            onClick={() => setFiltro(item.valor)}
            aria-pressed={filtro === item.valor}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filtro === item.valor
                ? 'border-primary bg-primary/10 font-semibold text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {item.texto}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {lista.map((venda) => {
          const situacao = SITUACOES[venda.situacao];
          const expandida = aberta === venda.id;
          const aguardandoEsta = venda.situacao === 'agendado';
          // No modo manual não existe janela: nada é despachado sem confirmação.
          const podeCancelar = aguardandoEsta && entradaAutomatica;
          const esperaConfirmacao = aguardandoEsta && !entradaAutomatica;
          const cadastro = CADASTRO[venda.cadastro];

          return (
            <Card
              key={venda.id}
              className={
                esperaConfirmacao
                  ? 'border-amber-500/40'
                  : podeCancelar
                    ? 'border-sky-500/30'
                    : undefined
              }
            >
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-28">
                    <p className="font-semibold">#{venda.numero}</p>
                    <p className="text-xs text-muted-foreground">{venda.horario}</p>
                  </div>

                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{venda.cliente}</p>
                    <p className="text-xs text-muted-foreground">
                      {venda.itens.length} {venda.itens.length === 1 ? 'item' : 'itens'} ·{' '}
                      {venda.pagamento}
                    </p>
                  </div>

                  {/* Quanto ainda dá para cancelar. Sem isto, a loja não sabe
                      que existe prazo — e descobre quando o motoboy chega. */}
                  {podeCancelar && venda.minutosParaDespachar !== null && (
                    <span className="flex items-center gap-1 text-sm font-medium text-sky-700">
                      <Timer className="size-4" aria-hidden="true" />
                      {venda.minutosParaDespachar} min
                    </span>
                  )}

                  {esperaConfirmacao && (
                    <Button size="sm" disabled>
                      <Check className="size-4" /> Confirmar
                    </Button>
                  )}

                  <p className="font-semibold">{moeda(venda.total)}</p>

                  <Badge className={situacao.classe} variant="secondary">
                    {esperaConfirmacao ? 'Aguardando confirmação' : situacao.texto}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAberta(expandida ? null : venda.id)}
                    aria-expanded={expandida}
                  >
                    {expandida ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    Detalhes
                  </Button>
                </div>

                {expandida && (
                  <div className="space-y-3 border-t pt-3 text-sm">
                    <ul className="space-y-2">
                      {venda.itens.map((item, indice) => (
                        <li key={`${venda.id}-${indice}`} className="flex justify-between gap-4">
                          <span>
                            <span className="font-medium">
                              {item.quantidade}× {item.nome}
                              {item.tamanho && ` — ${item.tamanho}`}
                            </span>
                            {item.escolhas.length > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                {item.escolhas.join(' · ')}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0">{moeda(item.total)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* O cliente do PWA vira cliente da loja aqui, com os
                        dados que ele mesmo digitou no checkout — em vez de
                        alguém redigitar tudo no cadastro depois. */}
                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{venda.cliente}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="size-3.5" aria-hidden="true" />
                          {venda.telefone}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{cadastro.texto}</p>
                      {cadastro.acao ? (
                        <Button variant="outline" size="sm" disabled>
                          <UserPlus className="size-4" /> {cadastro.acao}
                        </Button>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                          <Check className="size-3.5" aria-hidden="true" />
                          Nada a fazer.
                        </p>
                      )}
                    </div>

                    {/* O que o cliente escreveu vai para quem prepara, e por
                        isso não pode virar texto cinza no meio do resto. */}
                    {venda.observacao && (
                      <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
                        <MessageSquare
                          className="mt-0.5 size-4 shrink-0 text-amber-700"
                          aria-hidden="true"
                        />
                        {venda.observacao}
                      </p>
                    )}

                    <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                      {venda.retirarNaLoja ? (
                        /* Retirada não gera entrega: ninguém vai buscar, e
                           mostrar um endereço aqui faria a loja chamar motoboy
                           à toa. */
                        <p className="flex items-start gap-1.5 font-medium text-foreground">
                          <Store className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />O cliente
                          retira na loja — sem entrega.
                        </p>
                      ) : (
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {enderecoEmLinha(venda.entrega)}
                            {venda.entrega.referencia && (
                              // Referência é o que faz o motoboy achar a casa.
                              <span className="block">{venda.entrega.referencia}</span>
                            )}
                          </span>
                        </p>
                      )}
                      <p>
                        Pagamento: {venda.pagamento}
                        {venda.trocoPara !== null && (
                          // Troco é a informação que o motoboy precisa levar na
                          // mão. Enterrada numa observação de texto, ela se
                          // perde — por isso aparece destacada.
                          <strong className="text-foreground">
                            {' '}
                            · troco para {moeda(venda.trocoPara)}
                          </strong>
                        )}
                      </p>
                    </div>

                    {podeCancelar && (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        <Button variant="outline" size="sm" disabled>
                          Cancelar pedido
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Desativado na demonstração. Depois do prazo, o pedido já virou entrega e o
                          cancelamento passa a ser com a central.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {lista.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma venda com essa situação.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
