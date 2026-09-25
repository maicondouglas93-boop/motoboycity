'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Bike, CalendarClock, Inbox, MapPin, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { salvarOperacao, useOperacao } from '@/lib/loja-demo';
import { hora, horariosParaAgendar, rotuloDoDia } from '@/lib/loja-horario';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';
import {
  FOLGA_DA_ENTREGA_MIN,
  type EnderecoDeRetirada,
  type OperacaoDaLoja,
} from '@/lib/loja-operacao';
import type { ModoDeAceite, QuemEntrega } from '@/lib/loja-pedido';
import { useAgora } from '@/lib/relogio';

/**
 * Que tipos de pedido a loja aceita e como eles entram: entrega, retirada,
 * agendamento e o aceite.
 *
 * Os tempos ficam num lugar só, no recebimento. O "tempo estimado" da entrega
 * e o "pronto em" da retirada são o que o cliente vê desses dois números — com
 * um campo para cada, eles acabariam discordando, e o cliente leria uma
 * previsão que a cozinha nunca prometeu.
 *
 * "Aceitar automaticamente" também aparece uma vez só, no recebimento, e vale
 * para entrega e retirada: duas chaves para a mesma decisão acabariam uma
 * ligada e a outra desligada.
 */

type Partes = Pick<OperacaoDaLoja, 'recebimento' | 'entrega' | 'retirada' | 'agendamento'>;

interface Rascunho {
  modo: ModoDeAceite;
  preparo: string;
  caminho: string;
  prazoLigado: boolean;
  prazoMin: number;
  entregaAtiva: boolean;
  quemEntrega: QuemEntrega;
  pedidoMinimo: string;
  entregaAgendada: boolean;
  retiradaAtiva: boolean;
  outroEndereco: boolean;
  endereco: EnderecoDeRetirada;
  instrucoes: string;
  retiradaAgendada: boolean;
  agendar: boolean;
  antecedenciaMinimaMin: number;
  antecedenciaMaximaDias: number;
  intervaloMin: number;
}

const ANTECEDENCIAS_MINIMAS = [
  { valor: 30, texto: '30 minutos' },
  { valor: 60, texto: '1 hora' },
  { valor: 120, texto: '2 horas' },
  { valor: 180, texto: '3 horas' },
  { valor: 360, texto: '6 horas' },
  { valor: 720, texto: '12 horas' },
  { valor: 1440, texto: '1 dia' },
];

const ANTECEDENCIAS_MAXIMAS = [
  { valor: 0, texto: 'Só para hoje' },
  { valor: 1, texto: 'Até amanhã' },
  { valor: 2, texto: 'Até 2 dias' },
  { valor: 3, texto: 'Até 3 dias' },
  { valor: 7, texto: 'Até 7 dias' },
  { valor: 14, texto: 'Até 14 dias' },
  { valor: 30, texto: 'Até 30 dias' },
];

const INTERVALOS = [15, 30, 60];

const PRAZOS_DO_ACEITE = [5, 10, 15, 20, 30];

const ENDERECO_VAZIO: EnderecoDeRetirada = {
  rua: '',
  numero: '',
  complemento: null,
  bairro: '',
  cidade: '',
  estado: '',
};

function moedaParaTexto(valor: number | null): string {
  return valor === null ? '' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** "15,00" → 15. Vazio → `null` (sem mínimo). Qualquer outra coisa → `NaN`. */
function textoParaMoeda(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(limpo) ? Number(limpo) : Number.NaN;
}

function paraRascunho(operacao: OperacaoDaLoja): Rascunho {
  return {
    modo: operacao.recebimento.modo,
    preparo: String(operacao.recebimento.minutosDePreparo),
    caminho: String(operacao.recebimento.minutosDeEntrega),
    prazoLigado: operacao.recebimento.prazoDoAceiteMin !== null,
    prazoMin: operacao.recebimento.prazoDoAceiteMin ?? 10,
    entregaAtiva: operacao.entrega.ativa,
    quemEntrega: operacao.entrega.quemEntrega,
    pedidoMinimo: moedaParaTexto(operacao.entrega.pedidoMinimo),
    entregaAgendada: operacao.entrega.agendamento,
    retiradaAtiva: operacao.retirada.ativa,
    outroEndereco: operacao.retirada.endereco !== null,
    endereco: operacao.retirada.endereco ?? ENDERECO_VAZIO,
    instrucoes: operacao.retirada.instrucoes,
    retiradaAgendada: operacao.retirada.agendamento,
    agendar: operacao.agendamento.permitir,
    antecedenciaMinimaMin: operacao.agendamento.antecedenciaMinimaMin,
    antecedenciaMaximaDias: operacao.agendamento.antecedenciaMaximaDias,
    intervaloMin: operacao.agendamento.intervaloMin,
  };
}

function paraGravar(rascunho: Rascunho): Partes {
  return {
    recebimento: {
      modo: rascunho.modo,
      minutosDePreparo: Number(rascunho.preparo),
      minutosDeEntrega: Number(rascunho.caminho),
      prazoDoAceiteMin: rascunho.prazoLigado ? rascunho.prazoMin : null,
    },
    entrega: {
      ativa: rascunho.entregaAtiva,
      quemEntrega: rascunho.quemEntrega,
      pedidoMinimo: textoParaMoeda(rascunho.pedidoMinimo),
      agendamento: rascunho.entregaAgendada,
    },
    retirada: {
      ativa: rascunho.retiradaAtiva,
      endereco: rascunho.outroEndereco
        ? {
            ...rascunho.endereco,
            complemento: rascunho.endereco.complemento?.trim() || null,
          }
        : null,
      instrucoes: rascunho.instrucoes.trim(),
      agendamento: rascunho.retiradaAgendada,
    },
    agendamento: {
      permitir: rascunho.agendar,
      antecedenciaMinimaMin: rascunho.antecedenciaMinimaMin,
      antecedenciaMaximaDias: rascunho.antecedenciaMaximaDias,
      intervaloMin: rascunho.intervaloMin,
    },
  };
}

function inteiroEntre(texto: string, minimo: number, maximo: number): boolean {
  return /^\d+$/.test(texto.trim()) && Number(texto) >= minimo && Number(texto) <= maximo;
}

export default function LojaTiposDePedidoPage() {
  const operacao = useOperacao();
  const instante = useAgora();
  const [versao, setVersao] = useState(0);

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Tipos de pedido</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entrega, retirada e agendamento: o que o cliente pode escolher na sua página, e como o
          pedido entra na loja.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Demonstração: o que você salvar aqui fica só neste navegador, e vale para a página da loja
          aberta nele. Ainda não vai para o sistema.
        </CardContent>
      </Card>

      {instante !== 0 && (
        <Formulario
          key={versao}
          operacao={operacao}
          agora={new Date(instante)}
          onDescartar={() => setVersao((atual) => atual + 1)}
        />
      )}
    </div>
  );
}

function Formulario({
  operacao,
  agora,
  onDescartar,
}: {
  operacao: OperacaoDaLoja;
  agora: Date;
  onDescartar: () => void;
}) {
  const [rascunho, setRascunho] = useState(() => paraRascunho(operacao));

  function mudar(mudanca: Partial<Rascunho>) {
    setRascunho((atual) => ({ ...atual, ...mudanca }));
  }

  function mudarEndereco(campo: keyof EnderecoDeRetirada, valor: string) {
    setRascunho((atual) => ({ ...atual, endereco: { ...atual.endereco, [campo]: valor } }));
  }

  const preparoValido = inteiroEntre(rascunho.preparo, 1, 240);
  const caminhoValido = inteiroEntre(rascunho.caminho, 1, 180);
  const minimo = textoParaMoeda(rascunho.pedidoMinimo);

  const graves: string[] = [];
  if (!rascunho.entregaAtiva && !rascunho.retiradaAtiva) {
    graves.push(
      'Deixe entrega ou retirada ligada: sem nenhuma, o cliente não tem como receber o pedido.',
    );
  }
  if (!preparoValido) graves.push('O tempo de preparo precisa ser de 1 a 240 minutos.');
  if (!caminhoValido) graves.push('O tempo de entrega precisa ser de 1 a 180 minutos.');
  if (minimo !== null && Number.isNaN(minimo))
    graves.push('O pedido mínimo tem que ser um valor, como 15,00.');
  if (
    rascunho.retiradaAtiva &&
    rascunho.outroEndereco &&
    [rascunho.endereco.rua, rascunho.endereco.numero, rascunho.endereco.cidade].some(
      (campo) => campo.trim() === '',
    )
  ) {
    graves.push('O endereço de retirada precisa de rua, número e cidade.');
  }

  const gravar = paraGravar(rascunho);
  const salvo: Partes = {
    recebimento: operacao.recebimento,
    entrega: operacao.entrega,
    retirada: operacao.retirada,
    agendamento: operacao.agendamento,
  };
  const mudou = JSON.stringify(gravar) !== JSON.stringify(salvo);

  const preparo = preparoValido ? Number(rascunho.preparo) : operacao.recebimento.minutosDePreparo;
  const caminho = caminhoValido ? Number(rascunho.caminho) : operacao.recebimento.minutosDeEntrega;
  const coleta = LOJA_DE_EXEMPLO.pontoDeColeta;

  /*
   * A prévia dos horários usa o horário SALVO da loja e as regras deste
   * rascunho: é a resposta para "com isso, o que o cliente vai poder escolher?"
   * antes de salvar.
   */
  const previa = rascunho.agendar
    ? horariosParaAgendar(
        operacao.funcionamento,
        {
          antecedenciaMinimaMin: rascunho.antecedenciaMinimaMin,
          antecedenciaMaximaDias: rascunho.antecedenciaMaximaDias,
          intervaloMin: rascunho.intervaloMin,
        },
        preparo + caminho,
        agora,
      )
    : [];
  const primeiroDia = previa[0];

  const agendamentoDesligado = !rascunho.agendar;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bike className="size-5 text-muted-foreground" aria-hidden="true" /> Entrega
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={rascunho.entregaAtiva}
              onCheckedChange={(valor) => mudar({ entregaAtiva: valor === true })}
            />
            <span>
              Oferecer entrega
              <span className="block text-xs text-muted-foreground">
                A taxa que o cliente paga é a do bairro, em Configurações.
              </span>
            </span>
          </label>

          {rascunho.entregaAtiva && (
            <>
              {/* Há loja com motoboy próprio, e o pedido dela não pode cair na
                  lista de corridas do MOTOboyCity. Quem tem entregador ainda
                  pode chamar um motoboy do MOTOboyCity para um pedido só, na
                  própria venda — o dia em que o entregador faltou. */}
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Quem faz a entrega</legend>
                {(
                  [
                    {
                      valor: 'MOTOBOYCITY',
                      titulo: 'Motoboy do MOTOboyCity',
                      detalhe:
                        'O pedido pronto vira corrida no MOTOboyCity. A saída e a entrega chegam do aplicativo do motoboy, e a corrida entra na sua fatura, como as demais.',
                    },
                    {
                      valor: 'LOJA',
                      titulo: 'Entregador da loja',
                      detalhe:
                        'O pedido fica só em Vendas, fora da lista do MOTOboyCity, e a loja marca "Saiu para entrega" e "Entregue". Num dia de aperto, dá para chamar um motoboy do MOTOboyCity para um pedido, na própria venda.',
                    },
                  ] as const
                ).map((opcao) => (
                  <label
                    key={opcao.valor}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
                      rascunho.quemEntrega === opcao.valor
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="quemEntrega"
                      className="mt-1"
                      checked={rascunho.quemEntrega === opcao.valor}
                      onChange={() => mudar({ quemEntrega: opcao.valor })}
                    />
                    <span>
                      {opcao.titulo}
                      <span className="block text-xs text-muted-foreground">{opcao.detalhe}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Tempo estimado que o cliente vê: </span>
                <strong>
                  {preparo + caminho} a {preparo + caminho + FOLGA_DA_ENTREGA_MIN} min
                </strong>
                <span className="block text-xs text-muted-foreground">
                  Preparo ({preparo}) mais entrega ({caminho}), com {FOLGA_DA_ENTREGA_MIN} minutos
                  de folga — o caminho varia. Os dois tempos ficam em Recebimento, abaixo.
                </span>
              </div>

              <div className="max-w-48 space-y-2">
                <Label htmlFor="pedidoMinimo">Pedido mínimo</Label>
                <Input
                  id="pedidoMinimo"
                  inputMode="decimal"
                  value={rascunho.pedidoMinimo}
                  onChange={(evento) => mudar({ pedidoMinimo: evento.target.value })}
                  placeholder="sem mínimo"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Conta só os itens, sem a taxa, e vale só na entrega — na retirada não há taxa para
                proteger. Deixe vazio para não exigir.
              </p>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={rascunho.entregaAgendada && !agendamentoDesligado}
                  disabled={agendamentoDesligado}
                  onCheckedChange={(valor) => mudar({ entregaAgendada: valor === true })}
                />
                <span>
                  Aceitar entrega agendada
                  <span className="block text-xs text-muted-foreground">
                    {agendamentoDesligado
                      ? 'Ligue "Permitir pedido agendado" mais abaixo para usar.'
                      : 'O cliente escolhe o dia e a janela em que quer receber.'}
                  </span>
                </span>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="size-5 text-muted-foreground" aria-hidden="true" /> Retirada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={rascunho.retiradaAtiva}
              onCheckedChange={(valor) => mudar({ retiradaAtiva: valor === true })}
            />
            <span>
              Oferecer retirada na loja
              <span className="block text-xs text-muted-foreground">
                Sem taxa, sem endereço a preencher e sem motoboy: o cliente busca no balcão.
              </span>
            </span>
          </label>

          {rascunho.retiradaAtiva && (
            <>
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">O cliente vê: </span>
                <strong>pronto em {preparo} min</strong>
                <span className="block text-xs text-muted-foreground">
                  É o tempo de preparo de Recebimento, abaixo.
                </span>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Endereço de retirada</legend>
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="enderecoDeRetirada"
                    className="mt-1"
                    checked={!rascunho.outroEndereco}
                    onChange={() => mudar({ outroEndereco: false })}
                  />
                  <span>
                    O endereço da empresa
                    <span className="block text-xs text-muted-foreground">
                      {coleta.rua}, {coleta.numero} · {coleta.bairro}, {coleta.cidade}/
                      {coleta.estado}
                      {' — '}o mesmo de onde o motoboy retira.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="enderecoDeRetirada"
                    className="mt-1"
                    checked={rascunho.outroEndereco}
                    onChange={() => mudar({ outroEndereco: true })}
                  />
                  <span>
                    Outro endereço
                    <span className="block text-xs text-muted-foreground">
                      Um balcão em outro ponto, um quiosque. O motoboy continua retirando no
                      endereço da empresa.
                    </span>
                  </span>
                </label>

                {rascunho.outroEndereco && (
                  <div className="grid gap-2 pl-6 sm:grid-cols-[1fr_110px]">
                    <Input
                      value={rascunho.endereco.rua}
                      onChange={(evento) => mudarEndereco('rua', evento.target.value)}
                      placeholder="Rua"
                      aria-label="Rua da retirada"
                    />
                    <Input
                      value={rascunho.endereco.numero}
                      onChange={(evento) => mudarEndereco('numero', evento.target.value)}
                      placeholder="Número"
                      aria-label="Número da retirada"
                    />
                    <Input
                      value={rascunho.endereco.complemento ?? ''}
                      onChange={(evento) => mudarEndereco('complemento', evento.target.value)}
                      placeholder="Complemento"
                      aria-label="Complemento da retirada"
                    />
                    <Input
                      value={rascunho.endereco.bairro}
                      onChange={(evento) => mudarEndereco('bairro', evento.target.value)}
                      placeholder="Bairro"
                      aria-label="Bairro da retirada"
                    />
                    <Input
                      value={rascunho.endereco.cidade}
                      onChange={(evento) => mudarEndereco('cidade', evento.target.value)}
                      placeholder="Cidade"
                      aria-label="Cidade da retirada"
                    />
                    <Input
                      value={rascunho.endereco.estado}
                      onChange={(evento) =>
                        mudarEndereco('estado', evento.target.value.toUpperCase().slice(0, 2))
                      }
                      placeholder="UF"
                      aria-label="Estado da retirada"
                    />
                  </div>
                )}
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="instrucoes">Como retirar</Label>
                <Input
                  id="instrucoes"
                  value={rascunho.instrucoes}
                  onChange={(evento) => mudar({ instrucoes: evento.target.value })}
                  placeholder="Retire no balcão, dizendo o número do pedido."
                  maxLength={140}
                />
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={rascunho.retiradaAgendada && !agendamentoDesligado}
                  disabled={agendamentoDesligado}
                  onCheckedChange={(valor) => mudar({ retiradaAgendada: valor === true })}
                />
                <span>
                  Aceitar retirada agendada
                  <span className="block text-xs text-muted-foreground">
                    {agendamentoDesligado
                      ? 'Ligue "Permitir pedido agendado" abaixo para usar.'
                      : 'O cliente escolhe a hora de buscar.'}
                  </span>
                </span>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" /> Pedido
            agendado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={rascunho.agendar}
              onCheckedChange={(valor) => mudar({ agendar: valor === true })}
            />
            <span>
              Permitir pedido agendado
              <span className="block text-xs text-muted-foreground">
                O cliente pede agora para receber depois — inclusive com a loja fechada, que é
                quando o agendamento mais vende.
              </span>
            </span>
          </label>

          {rascunho.agendar && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="antecedenciaMinima">Antecedência mínima</Label>
                  <select
                    id="antecedenciaMinima"
                    value={rascunho.antecedenciaMinimaMin}
                    onChange={(evento) =>
                      mudar({ antecedenciaMinimaMin: Number(evento.target.value) })
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {ANTECEDENCIAS_MINIMAS.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {opcao.texto}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="antecedenciaMaxima">Antecedência máxima</Label>
                  <select
                    id="antecedenciaMaxima"
                    value={rascunho.antecedenciaMaximaDias}
                    onChange={(evento) =>
                      mudar({ antecedenciaMaximaDias: Number(evento.target.value) })
                    }
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {ANTECEDENCIAS_MAXIMAS.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {opcao.texto}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intervalo">Horários a cada</Label>
                  <select
                    id="intervalo"
                    value={rascunho.intervaloMin}
                    onChange={(evento) => mudar({ intervaloMin: Number(evento.target.value) })}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {INTERVALOS.map((minutos) => (
                      <option key={minutos} value={minutos}>
                        {minutos === 60 ? '1 hora' : `${minutos} minutos`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Os horários disponíveis seguem o horário da loja: uma janela só aparece se a loja
                estiver aberta na hora de a cozinha começar — o preparo, e na entrega também o
                caminho, antes da hora escolhida. Datas especiais, pausa e fechamento também valem.
              </p>

              {/* A resposta para "com isso, o que o cliente vai ver?". */}
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                {primeiroDia ? (
                  <>
                    <span className="text-muted-foreground">Primeiros horários de entrega: </span>
                    <strong>
                      {rotuloDoDia(primeiroDia.data, agora)},{' '}
                      {primeiroDia.horarios
                        .slice(0, 4)
                        .map((inicio) => hora(inicio))
                        .join(', ')}
                      {primeiroDia.horarios.length > 4 ? '…' : ''}
                    </strong>
                    <span className="block text-xs text-muted-foreground">
                      {previa.length === 1 ? '1 dia' : `${previa.length} dias`} com horário dentro
                      da antecedência máxima.
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Com o horário da loja e estas regras, nenhum horário fica disponível. Aumente a
                    antecedência máxima ou confira os Horários.
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-5 text-muted-foreground" aria-hidden="true" /> Recebimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Como o pedido entra</legend>
            {(
              [
                {
                  valor: 'AUTOMATICO',
                  titulo: 'Aceitar automaticamente',
                  detalhe:
                    'O pedido entra aceito e vai direto para a fila da cozinha. Ninguém precisa ficar olhando a tela.',
                },
                {
                  valor: 'MANUAL',
                  titulo: 'Aprovar manualmente',
                  detalhe:
                    'Cada pedido espera alguém da loja aceitar — e dá para ajustar o tempo de preparo ali, pedido a pedido.',
                },
              ] as const
            ).map((opcao) => (
              <label
                key={opcao.valor}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm ${
                  rascunho.modo === opcao.valor
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                }`}
              >
                <input
                  type="radio"
                  name="modoDeAceite"
                  className="mt-1"
                  checked={rascunho.modo === opcao.valor}
                  onChange={() => mudar({ modo: opcao.valor })}
                />
                <span>
                  {opcao.titulo}
                  <span className="block text-xs text-muted-foreground">{opcao.detalhe}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {/* O modo manual troca um problema por outro, e a tela diz qual — e
              oferece o remédio logo abaixo. */}
          {rascunho.modo === 'MANUAL' && (
            <>
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                <p>
                  <strong>Se ninguém estiver olhando a tela, o pedido fica esperando.</strong> Deixe
                  o som e a notificação de pedido novo ligados em{' '}
                  <Link href="/loja/notificacoes" className="underline">
                    Notificações
                  </Link>
                  .
                </p>
                <p>
                  Pedido pago online e recusado precisa de estorno. Quem estorna, e em quanto tempo,
                  ainda está em aberto no plano da loja.
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={rascunho.prazoLigado}
                    onCheckedChange={(valor) => mudar({ prazoLigado: valor === true })}
                  />
                  <span>
                    Cancelar sozinho se ninguém aceitar a tempo
                    <span className="block text-xs text-muted-foreground">
                      O cliente é avisado na hora, em vez de esperar uma resposta que não vem.
                      Pedido agendado espera até a hora de a cozinha começar.
                    </span>
                  </span>
                </label>
                {rascunho.prazoLigado && (
                  <label className="flex items-center gap-2 pl-6 text-sm">
                    Esperar o aceite por
                    <select
                      value={rascunho.prazoMin}
                      onChange={(evento) => mudar({ prazoMin: Number(evento.target.value) })}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="Quanto tempo esperar o aceite"
                    >
                      {PRAZOS_DO_ACEITE.map((minutos) => (
                        <option key={minutos} value={minutos}>
                          {minutos} minutos
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preparo">Tempo de preparo padrão (min)</Label>
              <Input
                id="preparo"
                inputMode="numeric"
                value={rascunho.preparo}
                onChange={(evento) => mudar({ preparo: evento.target.value })}
                aria-invalid={!preparoValido}
              />
              <p className="text-xs text-muted-foreground">
                Quanto a cozinha leva num dia normal.
                {rascunho.modo === 'MANUAL' && ' Ao aceitar, dá para mudar só naquele pedido.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caminho">Tempo de entrega padrão (min)</Label>
              <Input
                id="caminho"
                inputMode="numeric"
                value={rascunho.caminho}
                onChange={(evento) => mudar({ caminho: evento.target.value })}
                aria-invalid={!caminhoValido}
              />
              <p className="text-xs text-muted-foreground">
                Do motoboy sair da loja até chegar ao cliente, em média.
              </p>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Na entrega, o motoboy é chamado quando o pedido fica pronto — ou quando o preparo vence,
            o que vier primeiro. Assim ele chega com o pedido saindo, e não esperando no balcão.
          </p>
        </CardContent>
      </Card>

      {graves.length > 0 && (
        <div className="space-y-2" role="alert">
          {graves.map((texto) => (
            <p
              key={texto}
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
            >
              <AlertCircle
                className="mt-0.5 size-3.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              {texto}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!mudou || graves.length > 0}
          onClick={() => salvarOperacao(gravar)}
        >
          Salvar tipos de pedido
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
              : 'Tudo salvo neste navegador.'}
        </span>
      </div>
    </>
  );
}
