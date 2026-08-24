'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { VirtualSecretaryHistoryMessage } from '@motoboycity/types';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  MessageSquareText,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  CalendarRange,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { adminVirtualSecretaryApi } from '@/lib/api-client';
import { session } from '@/lib/session';

interface ChatMessage extends VirtualSecretaryHistoryMessage {
  id: string;
  tools?: string[];
}

const shortcuts = [
  { label: 'Resumo de hoje', prompt: 'Faça um resumo administrativo de hoje.', icon: Sparkles },
  {
    label: 'Faturamento do mês',
    prompt: 'Qual foi o faturamento e a receita da plataforma neste mês?',
    icon: CircleDollarSign,
  },
  {
    label: 'Cancelados hoje',
    prompt: 'Quantos pedidos foram cancelados hoje e quais empresas tiveram mais cancelamentos?',
    icon: PackageSearch,
  },
  {
    label: 'Motoboys online',
    prompt: 'Quantos motoboys estão online agora e quais são eles?',
    icon: Truck,
  },
];

const toolLabels: Record<string, string> = {
  gerar_resumo_administrativo: 'Resumo administrativo',
  consultar_relatorio_periodo: 'Relatório do período',
  consultar_operacao_atual: 'Operação em tempo real',
  buscar_pedidos: 'Consulta de pedidos',
  buscar_empresas: 'Consulta de empresas',
  buscar_entregadores: 'Consulta de motoboys',
  responder_sem_consulta: 'Resposta institucional',
};

export default function VirtualSecretaryPage() {
  const token = session.getToken();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const chatMutation = useMutation({
    mutationFn: (payload: { message: string; history: VirtualSecretaryHistoryMessage[] }) =>
      adminVirtualSecretaryApi.chat(token as string, payload),
    onSuccess: (result) => {
      setMessages((current) => [
        ...current,
        {
          id: result.requestId,
          role: 'assistant',
          content: result.answer,
          tools: result.toolNames,
        },
      ]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatMutation.isPending]);

  function sendMessage(text: string) {
    const message = text.trim();
    if (!message || !token || chatMutation.isPending) return;
    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: message },
    ]);
    setInput('');
    chatMutation.mutate({ message, history });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1480px] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(10,53,64,0.7)] ring-1 ring-asfalto/[0.05]">
        <header className="relative overflow-hidden border-b border-white/10 bg-admin-deep px-5 py-5 text-white sm:px-7">
          <div className="pointer-events-none absolute -top-20 right-10 size-52 rounded-full bg-primary/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-colete/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
                <Bot className="size-5 text-[#8de0dc]" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading text-xl font-semibold tracking-tight">
                    Secretária Virtual
                  </h1>
                  <span className="rounded-full border border-[#72d3ce]/25 bg-[#35b8b2]/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#aee8e4] uppercase">
                    Groq
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-white/60">
                  Consulte a operação usando linguagem natural.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs text-white/70">
              <span className="size-1.5 rounded-full bg-[#4bd3a5] shadow-[0_0_0_4px_rgba(75,211,165,0.1)]" />
              Somente consultas
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-14.5rem)] min-h-[540px] flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7" aria-live="polite">
            {messages.length === 0 ? (
              <EmptyState onShortcut={sendMessage} />
            ) : (
              <div className="space-y-5">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' && <AssistantAvatar />}
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === 'user'
                          ? 'rounded-tr-md bg-primary text-white'
                          : 'rounded-tl-md border border-border/70 bg-admin-soft/50 text-foreground'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.tools && message.tools.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-primary/10 pt-2.5">
                          {message.tools.map((tool) => (
                            <span
                              key={tool}
                              className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/70"
                            >
                              {toolLabels[tool] ?? tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl border border-border bg-white text-admin-deep shadow-sm">
                        <UserRound className="size-4" aria-hidden="true" />
                      </span>
                    )}
                  </article>
                ))}
                {chatMutation.isPending && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <AssistantAvatar />
                    <span className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/70 bg-admin-soft/50 px-4 py-3">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((item) => (
                          <span
                            key={item}
                            className="size-1.5 animate-pulse rounded-full bg-primary"
                            style={{ animationDelay: `${item * 160}ms` }}
                          />
                        ))}
                      </span>
                      Consultando dados da operação…
                    </span>
                  </div>
                )}
                {chatMutation.isError && (
                  <div className="flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>
                      {chatMutation.error instanceof Error
                        ? chatMutation.error.message
                        : 'Não foi possível consultar a Secretária Virtual.'}
                    </p>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border/70 bg-white/80 p-4 sm:px-7 sm:py-5">
            <div className="flex items-end gap-2 rounded-2xl border border-input bg-white p-2 shadow-[0_10px_30px_-24px_rgba(10,53,64,0.8)] focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-primary/10">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2_000}
                rows={2}
                placeholder="Ex.: Quantos pedidos foram concluídos hoje?"
                aria-label="Pergunta para a Secretária Virtual"
                className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground/70"
              />
              <Button
                type="submit"
                size="icon-lg"
                disabled={!input.trim() || chatMutation.isPending || !token}
                aria-label="Enviar pergunta"
                className="mb-0.5 rounded-xl"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
              <span>Enter envia · Shift + Enter quebra a linha</span>
              <span>{input.length}/2.000</span>
            </div>
          </form>
        </div>
      </section>

      <SecuritySidebar onPerguntar={sendMessage} desabilitado={chatMutation.isPending} />
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-admin-deep text-[#8de0dc] shadow-sm">
      <Bot className="size-4" aria-hidden="true" />
    </span>
  );
}

function EmptyState({ onShortcut }: { onShortcut: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center py-8 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl" />
        <div className="relative grid size-16 place-items-center rounded-3xl border border-primary/15 bg-gradient-to-br from-admin-soft to-white shadow-lg shadow-primary/10">
          <MessageSquareText className="size-7 text-primary" aria-hidden="true" />
        </div>
      </div>
      <h2 className="font-heading text-2xl font-semibold text-admin-deep">O que você quer saber?</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        Peça resumos, consulte pedidos, compare períodos ou verifique quem está online. Os números
        vêm das ferramentas administrativas da plataforma.
      </p>
      <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
        {shortcuts.map(({ label, prompt, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onShortcut(prompt)}
            className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-white px-4 py-3 text-left text-sm font-medium text-admin-deep shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-admin-soft/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-admin-soft text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Perguntas prontas, agrupadas pelo que a secretária REALMENTE consulta.
 *
 * Cada grupo corresponde a uma ferramenta que existe do lado do servidor
 * (`virtual-secretary-tools.service.ts`): resumo de hoje, relatório por
 * período, operação em tempo real e busca de pedidos, empresas e motoboys.
 *
 * Isso não é detalhe de organização: uma sugestão que a IA não consegue
 * responder é pior do que nenhuma sugestão. O atalho promete, e a resposta
 * vem dizendo que está fora do escopo — e a pessoa para de confiar na coluna
 * inteira.
 *
 * As comparações entre dois períodos cabem porque o servidor permite até três
 * consultas encadeadas por pergunta (`MAX_TOOL_EXECUTIONS`).
 */
const GRUPOS_DE_PERGUNTAS: Array<{
  titulo: string;
  icone: LucideIcon;
  cor: string;
  perguntas: string[];
}> = [
  {
    titulo: 'Agora',
    icone: Radio,
    cor: 'bg-primary/10 text-primary',
    perguntas: [
      'Quantos motoboys estão online agora e quais são eles?',
      'Como estão as filas neste momento?',
      'Quais pedidos estão esperando um motoboy aceitar?',
      'Tem algum pedido em rota há mais tempo que o normal?',
    ],
  },
  {
    titulo: 'Hoje',
    icone: Sparkles,
    cor: 'bg-colete/15 text-colete-escuro',
    perguntas: [
      'Faça um resumo administrativo de hoje.',
      'Quantos pedidos foram concluídos hoje?',
      'Quantos pedidos foram cancelados hoje e quais empresas tiveram mais cancelamentos?',
      'Qual foi a receita da plataforma hoje?',
      'Como hoje está em relação a ontem?',
    ],
  },
  {
    titulo: 'Semana',
    icone: CalendarRange,
    cor: 'bg-status-pagamento/10 text-status-pagamento',
    perguntas: [
      'Qual foi o faturamento desta semana?',
      'Compare esta semana com a semana passada.',
      'Quais empresas mais pediram nos últimos 7 dias?',
      'Quantos cancelamentos tivemos nos últimos 7 dias?',
    ],
  },
  {
    titulo: 'Mês',
    icone: CircleDollarSign,
    cor: 'bg-placa/10 text-placa',
    perguntas: [
      'Qual foi o faturamento e a receita da plataforma neste mês?',
      'Quantas entregas foram concluídas neste mês?',
      'Compare este mês com o mês passado.',
      'Quais motoboys mais entregaram neste mês?',
    ],
  },
  {
    titulo: 'Buscar',
    icone: PackageSearch,
    cor: 'bg-admin-soft text-admin-deep',
    perguntas: [
      'Quais empresas estão cadastradas e qual o volume de cada uma?',
      'Quais motoboys estão aprovados e em quais modalidades?',
      'Mostre os últimos pedidos cancelados.',
      'Mostre os pedidos que não foram entregues nos últimos 7 dias.',
    ],
  },
];

/**
 * A coluna de perguntas prontas.
 *
 * Some quando o chat está esperando resposta: um clique enquanto a anterior
 * ainda roda seria descartado em silêncio pelo `sendMessage`, e o usuário
 * concluiria que o botão não funciona.
 */
function PerguntasProntas({
  onPerguntar,
  desabilitado,
}: {
  onPerguntar: (pergunta: string) => void;
  desabilitado: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-heading font-semibold text-admin-deep">Perguntas prontas</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Clique para enviar. Todas usam consultas que a secretária sabe fazer.
          </p>
        </div>

        <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
          {GRUPOS_DE_PERGUNTAS.map(({ titulo, icone: Icone, cor, perguntas }) => (
            <div key={titulo} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`grid size-6 place-items-center rounded-lg ${cor}`}>
                  <Icone className="size-3" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold tracking-wide text-admin-deep uppercase">
                  {titulo}
                </span>
              </div>
              {perguntas.map((pergunta) => (
                <button
                  key={pergunta}
                  type="button"
                  disabled={desabilitado}
                  onClick={() => onPerguntar(pergunta)}
                  className="block w-full rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/35 hover:bg-admin-soft hover:text-admin-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pergunta}
                </button>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySidebar({
  onPerguntar,
  desabilitado,
}: {
  onPerguntar: (pergunta: string) => void;
  desabilitado: boolean;
}) {
  return (
    <aside className="space-y-4">
      <PerguntasProntas onPerguntar={onPerguntar} desabilitado={desabilitado} />
      <Card className="bg-gradient-to-br from-admin-deep to-[#0c4650] text-white ring-0 before:hidden">
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/10">
              <ShieldCheck className="size-4 text-[#8de0dc]" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading font-semibold">Consulta protegida</h2>
              <p className="text-xs text-white/55">Escopo administrativo</p>
            </div>
          </div>
          <ul className="space-y-3 text-xs leading-5 text-white/70">
            <li className="flex gap-2">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#8de0dc]" />
              A chave da IA fica somente no servidor.
            </li>
            <li className="flex gap-2">
              <PackageSearch className="mt-0.5 size-3.5 shrink-0 text-[#8de0dc]" />
              Dados pessoais e endereços não são enviados ao modelo.
            </li>
            <li className="flex gap-2">
              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-[#8de0dc]" />
              Consultas e ferramentas ficam registradas em auditoria.
            </li>
          </ul>
        </CardContent>
      </Card>
    </aside>
  );
}
