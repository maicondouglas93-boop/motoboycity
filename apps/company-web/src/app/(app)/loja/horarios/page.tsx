'use client';

import { useState } from 'react';
import { AlertCircle, CalendarPlus, Copy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { useGravarOperacao, useOperacaoDaLoja } from '@/components/loja/operacao';
import { companyStoreOperationApi } from '@/lib/api-client';
import {
  DIAS_DA_SEMANA,
  ORDEM_DA_SEMANA,
  dataCurta,
  excecaoDaData,
  momentoNaLoja,
  observacaoDaFaixa,
  problemasDoHorario,
  proximosFeriados,
  situacaoDaLoja,
  type ExcecaoDeData,
  type FaixaDeHorario,
  type Funcionamento,
  type TipoDeExcecao,
} from '@/lib/loja-horario';
import { useAgora } from '@/lib/relogio';

/**
 * O horário da loja: a semana, as datas que fogem dela e o recado para quando
 * ela está fechada.
 *
 * O que a loja decide NA HORA — pausar, fechar antes, abrir fora do horário —
 * não está aqui: fica no status, no alto da barra lateral, porque é usado com
 * pressa e em qualquer tela.
 */

type FaixaNaTela = FaixaDeHorario & { id: string };

interface DiaNaTela {
  dia: number;
  aberto: boolean;
  faixas: FaixaNaTela[];
}

type ExcecaoNaTela = Omit<ExcecaoDeData, 'faixas'> & { faixas: FaixaNaTela[]; variosDias: boolean };

type Configuravel = Omit<Funcionamento, 'ajuste'>;

const MAXIMO_DE_PERIODOS = 3;
const TAMANHO_DO_RECADO = 160;

function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function comId(faixas: FaixaDeHorario[]): FaixaNaTela[] {
  return faixas.map((faixa) => ({ ...faixa, id: novoId() }));
}

function semId(faixas: FaixaNaTela[]): FaixaDeHorario[] {
  return faixas.map(({ abre, fecha }) => ({ abre, fecha }));
}

function paraATela(funcionamento: Funcionamento) {
  return {
    semana: ORDEM_DA_SEMANA.map((dia): DiaNaTela => {
      const faixas = funcionamento.semana.find((item) => item.dia === dia)?.faixas ?? [];
      return { dia, aberto: faixas.length > 0, faixas: comId(faixas) };
    }),
    excecoes: funcionamento.excecoes.map((excecao): ExcecaoNaTela => ({
      ...excecao,
      faixas: comId(excecao.faixas),
      variosDias: excecao.fim !== excecao.inicio,
    })),
    mensagemFechada: funcionamento.mensagemFechada,
  };
}

/** O que vai ser gravado — no formato e na ordem em que fica guardado. */
function paraGravar(
  semana: DiaNaTela[],
  excecoes: ExcecaoNaTela[],
  mensagem: string,
): Configuravel {
  return {
    semana: [...semana]
      .sort((a, b) => a.dia - b.dia)
      .map((linha) => ({ dia: linha.dia, faixas: linha.aberto ? semId(linha.faixas) : [] })),
    excecoes: [...excecoes]
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(({ variosDias, faixas, ...excecao }) => ({
        ...excecao,
        motivo: excecao.motivo.trim(),
        fim: variosDias ? excecao.fim : excecao.inicio,
        faixas: excecao.tipo === 'HORARIO_ESPECIAL' ? semId(faixas) : [],
      })),
    mensagemFechada: mensagem.trim(),
  };
}

function configuravel(funcionamento: Funcionamento): Configuravel {
  return {
    semana: [...funcionamento.semana].sort((a, b) => a.dia - b.dia),
    excecoes: [...funcionamento.excecoes].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    mensagemFechada: funcionamento.mensagemFechada,
  };
}

/**
 * A mesma configuração com as chaves numa ordem só. O banco (JSONB) não guarda
 * a ordem das chaves, e o "há alterações" não pode acusar mudança só porque o
 * que voltou da API veio em outra ordem.
 */
function canonica(config: Configuravel): string {
  const faixas = (lista: Configuravel['semana'][number]['faixas']) =>
    lista.map(({ abre, fecha }) => ({ abre, fecha }));
  return JSON.stringify({
    semana: config.semana.map(({ dia, faixas: doDia }) => ({ dia, faixas: faixas(doDia) })),
    excecoes: config.excecoes.map(({ id, inicio, fim, tipo, motivo, faixas: daData }) => ({
      id,
      inicio,
      fim,
      tipo,
      motivo,
      faixas: faixas(daData),
    })),
    mensagemFechada: config.mensagemFechada,
  });
}

export default function LojaHorariosPage() {
  const consulta = useOperacaoDaLoja();
  const operacao = consulta.data;
  const instante = useAgora();
  const [versao, setVersao] = useState(0);

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Horários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando sua página aceita pedido. Fora desses horários o cliente vê o cardápio, mas só
          consegue agendar — ou esperar abrir.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          O horário é salvo no sistema e vale para a página da sua loja: fora dele, ela aparece
          fechada.
        </CardContent>
      </Card>

      {/* O formulário só nasce depois da hidratação, com o que está salvo:
          `useState` só lê o valor inicial uma vez, e nascer com o exemplo
          apagaria o que a loja já tinha salvo. */}
      {consulta.isError && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">Não foi possível carregar o horário.</p>
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
      {!operacao && !consulta.isError && (
        <p className="text-sm text-muted-foreground">Carregando o horário...</p>
      )}
      {instante !== 0 && operacao && (
        <Formulario
          key={versao}
          salvo={operacao.funcionamento}
          agora={new Date(instante)}
          onDescartar={() => setVersao((atual) => atual + 1)}
        />
      )}
    </div>
  );
}

function Formulario({
  salvo,
  agora,
  onDescartar,
}: {
  salvo: Funcionamento;
  agora: Date;
  onDescartar: () => void;
}) {
  const [inicial] = useState(() => paraATela(salvo));
  const [semana, setSemana] = useState<DiaNaTela[]>(inicial.semana);
  const [excecoes, setExcecoes] = useState<ExcecaoNaTela[]>(inicial.excecoes);
  const [mensagem, setMensagem] = useState(inicial.mensagemFechada);
  const [verPassadas, setVerPassadas] = useState(false);

  const hoje = momentoNaLoja(agora).data;
  const rascunho = paraGravar(semana, excecoes, mensagem);
  const mudou = canonica(rascunho) !== canonica(configuravel(salvo));
  const gravar = useGravarOperacao(companyStoreOperationApi.updateSchedule);
  const problemas = problemasDoHorario({ ...rascunho, ajuste: null }, hoje);
  const graves = problemas.filter((problema) => problema.grave);

  const sugeridos = proximosFeriados(agora).filter((feriado) => {
    const excecoesAtuais = excecoes.map((excecao) => ({
      ...excecao,
      fim: excecao.variosDias ? excecao.fim : excecao.inicio,
    }));
    return excecaoDaData(excecoesAtuais, feriado.data) === null;
  });

  const passadas = excecoes.filter(
    (excecao) =>
      excecao.inicio !== '' && (excecao.variosDias ? excecao.fim : excecao.inicio) < hoje,
  );
  const visiveis = excecoes.filter((excecao) => !passadas.includes(excecao));

  /* --- semana --- */

  function mudarDia(dia: number, mudanca: (linha: DiaNaTela) => DiaNaTela) {
    setSemana((atual) => atual.map((linha) => (linha.dia === dia ? mudanca(linha) : linha)));
  }

  function alternarDia(dia: number, aberto: boolean) {
    mudarDia(dia, (linha) => ({
      ...linha,
      aberto,
      // Reabrir um dia sem período deixaria "aberto" sem hora nenhuma.
      faixas:
        aberto && linha.faixas.length === 0
          ? [{ id: novoId(), abre: '18:00', fecha: '22:00' }]
          : linha.faixas,
    }));
  }

  function alterarFaixaDoDia(dia: number, id: string, campo: 'abre' | 'fecha', valor: string) {
    mudarDia(dia, (linha) => ({
      ...linha,
      faixas: linha.faixas.map((faixa) => (faixa.id === id ? { ...faixa, [campo]: valor } : faixa)),
    }));
  }

  function removerFaixaDoDia(dia: number, id: string) {
    mudarDia(dia, (linha) => {
      const faixas = linha.faixas.filter((faixa) => faixa.id !== id);
      // Tirou o último período: o dia fica fechado, e o controle diz isso.
      return { ...linha, faixas, aberto: faixas.length > 0 };
    });
  }

  function acrescentarFaixaNoDia(dia: number) {
    mudarDia(dia, (linha) => ({
      ...linha,
      faixas: [...linha.faixas, { id: novoId(), abre: '18:00', fecha: '22:00' }],
    }));
  }

  /** Copia os períodos para os outros dias ABERTOS — não abre o domingo de ninguém sem querer. */
  function copiarParaOsAbertos(origem: DiaNaTela) {
    setSemana((atual) =>
      atual.map((linha) =>
        linha.dia !== origem.dia && linha.aberto
          ? { ...linha, faixas: origem.faixas.map((faixa) => ({ ...faixa, id: novoId() })) }
          : linha,
      ),
    );
  }

  /* --- datas especiais --- */

  function mudarExcecao(id: string, mudanca: Partial<ExcecaoNaTela>) {
    setExcecoes((atual) =>
      atual.map((excecao) => (excecao.id === id ? { ...excecao, ...mudanca } : excecao)),
    );
  }

  function acrescentarExcecao(tipo: TipoDeExcecao, data = '', motivo = '') {
    setExcecoes((atual) => [
      ...atual,
      {
        id: novoId(),
        inicio: data,
        fim: data,
        tipo,
        motivo,
        variosDias: false,
        faixas:
          tipo === 'HORARIO_ESPECIAL' ? [{ id: novoId(), abre: '11:00', fecha: '16:00' }] : [],
      },
    ]);
  }

  function salvar() {
    // Só o horário vai: a pausa que alguém fez pelo status, com esta tela
    // aberta, fica como está — o ajuste tem gravação própria.
    gravar.mutate(rascunho, {
      onSuccess: () =>
        setExcecoes((atual) => [...atual].sort((a, b) => a.inicio.localeCompare(b.inicio))),
    });
  }

  const situacaoDoRascunho = situacaoDaLoja({ ...rascunho, ajuste: null }, agora);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Horário normal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Até três períodos por dia — almoço e janta é o comum. Um período que fecha depois da
            meia-noite, como 18:00 às 02:00, vale como horário do dia em que abriu.
          </p>

          {semana.map((linha) => (
            <div key={linha.dia} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex w-28 items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={linha.aberto}
                    onCheckedChange={(valor) => alternarDia(linha.dia, valor === true)}
                  />
                  {DIAS_DA_SEMANA[linha.dia]}
                </label>
                {!linha.aberto && <span className="text-sm text-muted-foreground">Fechado</span>}
                {linha.aberto && (
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={linha.faixas.length >= MAXIMO_DE_PERIODOS}
                      onClick={() => acrescentarFaixaNoDia(linha.dia)}
                    >
                      <Plus className="size-4" /> Período
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copiarParaOsAbertos(linha)}
                      aria-label={`Copiar o horário de ${DIAS_DA_SEMANA[linha.dia]} para os outros dias abertos`}
                    >
                      <Copy className="size-4" /> Copiar para os dias abertos
                    </Button>
                  </div>
                )}
              </div>

              {linha.aberto &&
                linha.faixas.map((faixa) => (
                  <LinhaDaFaixa
                    key={faixa.id}
                    faixa={faixa}
                    rotulo={DIAS_DA_SEMANA[linha.dia] ?? ''}
                    recuo
                    onMudar={(campo, valor) => alterarFaixaDoDia(linha.dia, faixa.id, campo, valor)}
                    onRemover={() => removerFaixaDoDia(linha.dia, faixa.id)}
                  />
                ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datas especiais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Feriado, férias, reforma, véspera com horário curto. Valem por cima do horário normal
            naquelas datas — sem precisar mexer na semana e lembrar de desfazer depois. O motivo
            aparece para o cliente.
          </p>

          {visiveis.map((excecao) => (
            <DataEspecial
              key={excecao.id}
              excecao={excecao}
              onMudar={(mudanca) => mudarExcecao(excecao.id, mudanca)}
              onRemover={() =>
                setExcecoes((atual) => atual.filter((item) => item.id !== excecao.id))
              }
            />
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => acrescentarExcecao('FECHADO')}
            >
              <Plus className="size-4" /> Fechar em uma data
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => acrescentarExcecao('HORARIO_ESPECIAL')}
            >
              <Plus className="size-4" /> Horário especial
            </Button>
          </div>

          {/* A lista oficial, para não ter de lembrar a data do Corpus Christi.
              Nada fecha sozinho: cada loja decide em quais feriados trabalha. */}
          {sugeridos.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Feriados nacionais dos próximos meses</p>
              <div className="flex flex-wrap gap-2">
                {sugeridos.map((feriado) => (
                  <Button
                    key={feriado.data}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => acrescentarExcecao('FECHADO', feriado.data, feriado.nome)}
                    aria-label={`Fechar em ${dataCurta(feriado.data)}, ${feriado.nome}`}
                  >
                    <CalendarPlus className="size-4" />
                    {dataCurta(feriado.data)} · {feriado.nome}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Toque para fechar a loja no dia. Dá para trocar para horário especial depois.
                Carnaval e Corpus Christi são ponto facultativo; feriados da sua cidade e do seu
                estado, você acrescenta acima.
              </p>
            </div>
          )}

          {passadas.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {passadas.length === 1
                    ? '1 data que já passou'
                    : `${passadas.length} datas que já passaram`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVerPassadas((atual) => !atual)}
                >
                  {verPassadas ? 'Esconder' : 'Ver'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setExcecoes((atual) => atual.filter((excecao) => !passadas.includes(excecao)))
                  }
                >
                  <Trash2 className="size-4" /> Remover
                </Button>
              </div>
              {verPassadas &&
                passadas.map((excecao) => (
                  <p key={excecao.id} className="text-xs text-muted-foreground">
                    {dataCurta(excecao.inicio)}
                    {excecao.variosDias ? ` a ${dataCurta(excecao.fim)}` : ''} ·{' '}
                    {excecao.motivo ||
                      (excecao.tipo === 'FECHADO' ? 'fechado' : 'horário especial')}
                  </p>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quando a loja está fechada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="mensagemFechada">Recado para o cliente</Label>
            <textarea
              id="mensagemFechada"
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              maxLength={TAMANHO_DO_RECADO}
              rows={2}
              placeholder="Obrigado pela visita! Logo mais a cozinha está de volta."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {mensagem.length}/{TAMANHO_DO_RECADO}. Aparece junto com a situação. A hora de abrir e
              o aviso de que dá para agendar a página já escreve sozinha — não precisam estar aqui.
            </p>
          </div>

          {/* O cliente lê as duas coisas juntas: o que a página calcula e o
              que a loja escreveu. A prévia mostra as duas, para o recado não
              repetir — nem contradizer — o horário. */}
          <div className="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">O cliente vê:</p>
            <p className="font-medium">
              {situacaoDoRascunho.aberta
                ? 'Fechado · abre amanhã às 11:00'
                : situacaoDoRascunho.texto}
            </p>
            {mensagem.trim() && <p>{mensagem.trim()}</p>}
          </div>
        </CardContent>
      </Card>

      {problemas.length > 0 && (
        <div className="space-y-2" role="alert">
          {problemas.map((problema, indice) => (
            <p
              key={`${indice}-${problema.texto}`}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                problema.grave
                  ? 'border-destructive/30 bg-destructive/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              }`}
            >
              <AlertCircle
                className={`mt-0.5 size-3.5 shrink-0 ${problema.grave ? 'text-destructive' : 'text-amber-700'}`}
                aria-hidden="true"
              />
              {problema.texto}
            </p>
          ))}
        </div>
      )}

      {gravar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {mensagemDoErro(gravar.error, 'Não foi possível salvar o horário.')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!mudou || graves.length > 0 || gravar.isPending}
          onClick={salvar}
        >
          {gravar.isPending ? 'Salvando...' : 'Salvar horários'}
        </Button>
        {mudou && (
          <Button type="button" variant="ghost" onClick={onDescartar}>
            Descartar alterações
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {graves.length > 0
            ? 'Resolva o que está em vermelho para salvar.'
            : mudou
              ? 'Há alterações não salvas.'
              : 'Tudo salvo.'}
        </span>
      </div>
    </>
  );
}

function LinhaDaFaixa({
  faixa,
  rotulo,
  recuo = false,
  onMudar,
  onRemover,
}: {
  faixa: FaixaNaTela;
  rotulo: string;
  recuo?: boolean;
  onMudar: (campo: 'abre' | 'fecha', valor: string) => void;
  onRemover: () => void;
}) {
  const observacao = observacaoDaFaixa(faixa);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${recuo ? 'sm:pl-[7.75rem]' : ''}`}>
      <Input
        type="time"
        value={faixa.abre}
        onChange={(evento) => onMudar('abre', evento.target.value)}
        aria-label={`${rotulo}: abre às`}
        className="w-[6.5rem] px-2"
      />
      <span className="text-sm text-muted-foreground">às</span>
      <Input
        type="time"
        value={faixa.fecha}
        onChange={(evento) => onMudar('fecha', evento.target.value)}
        aria-label={`${rotulo}: fecha às`}
        className="w-[6.5rem] px-2"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Remover período de ${rotulo}`}
        onClick={onRemover}
      >
        <Trash2 className="size-4" />
      </Button>
      {observacao && <span className="text-xs text-muted-foreground">{observacao}</span>}
    </div>
  );
}

function DataEspecial({
  excecao,
  onMudar,
  onRemover,
}: {
  excecao: ExcecaoNaTela;
  onMudar: (mudanca: Partial<ExcecaoNaTela>) => void;
  onRemover: () => void;
}) {
  const rotulo = excecao.motivo || (excecao.inicio ? dataCurta(excecao.inicio) : 'data especial');

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={`Tipo de ${rotulo}`} className="flex gap-1">
          {(
            [
              { valor: 'FECHADO', texto: 'Fechado' },
              { valor: 'HORARIO_ESPECIAL', texto: 'Horário especial' },
            ] as const
          ).map((opcao) => (
            <label
              key={opcao.valor}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors ${
                excecao.tipo === opcao.valor
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={excecao.tipo === opcao.valor}
                onChange={() =>
                  onMudar({
                    tipo: opcao.valor,
                    faixas:
                      opcao.valor === 'HORARIO_ESPECIAL' && excecao.faixas.length === 0
                        ? [{ id: novoId(), abre: '11:00', fecha: '16:00' }]
                        : excecao.faixas,
                  })
                }
              />
              {opcao.texto}
            </label>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label={`Remover ${rotulo}`}
          onClick={onRemover}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[160px_160px_1fr] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">{excecao.variosDias ? 'De' : 'Data'}</Label>
          <Input
            type="date"
            value={excecao.inicio}
            onChange={(evento) => onMudar({ inicio: evento.target.value })}
            aria-label={`Data de ${rotulo}`}
          />
        </div>
        {excecao.variosDias ? (
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={excecao.fim}
              min={excecao.inicio || undefined}
              onChange={(evento) => onMudar({ fim: evento.target.value })}
              aria-label={`Último dia de ${rotulo}`}
            />
          </div>
        ) : (
          <label className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={false}
              onCheckedChange={(valor) =>
                valor === true && onMudar({ variosDias: true, fim: excecao.fim || excecao.inicio })
              }
            />
            Mais de um dia
          </label>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Motivo</Label>
          <Input
            value={excecao.motivo}
            maxLength={80}
            onChange={(evento) => onMudar({ motivo: evento.target.value })}
            placeholder="Feriado, férias, reforma"
            aria-label={`Motivo de ${rotulo}`}
          />
        </div>
      </div>

      {excecao.variosDias && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onMudar({ variosDias: false })}
        >
          Só um dia
        </Button>
      )}

      {excecao.tipo === 'HORARIO_ESPECIAL' && (
        <div className="space-y-2">
          {excecao.faixas.map((faixa) => (
            <LinhaDaFaixa
              key={faixa.id}
              faixa={faixa}
              rotulo={rotulo}
              onMudar={(campo, valor) =>
                onMudar({
                  faixas: excecao.faixas.map((item) =>
                    item.id === faixa.id ? { ...item, [campo]: valor } : item,
                  ),
                })
              }
              onRemover={() =>
                onMudar({ faixas: excecao.faixas.filter((item) => item.id !== faixa.id) })
              }
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={excecao.faixas.length >= MAXIMO_DE_PERIODOS}
            onClick={() =>
              onMudar({
                faixas: [...excecao.faixas, { id: novoId(), abre: '18:00', fecha: '22:00' }],
              })
            }
          >
            <Plus className="size-4" /> Período
          </Button>
        </div>
      )}
    </div>
  );
}
