'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  Copy,
  ImagePlus,
  Link2,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DIAS_DA_SEMANA, LOJA_DE_EXEMPLO, type DiaFechado } from '@/lib/loja-mock';
import {
  MINIMO_PARA_BOTAO,
  MINIMO_PARA_TEXTO,
  type TemaDaLoja,
  contrasteComAPagina,
  fundoDoTema,
  textoSobre,
} from '@/lib/contraste';

const DOMINIO = 'pedidos.motoboycity.com.br';

interface LinhaDeBairro {
  id: string;
  nome: string;
  taxa: string;
}

interface LinhaDeFaixa {
  id: string;
  abre: string;
  fecha: string;
}

interface LinhaDeDia {
  dia: number;
  faixas: LinhaDeFaixa[];
}

function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const TEMAS: Array<{ valor: TemaDaLoja; texto: string }> = [
  { valor: 'CLARO', texto: 'Claro' },
  { valor: 'ESCURO', texto: 'Escuro' },
];

type FormaDePagamento = 'PIX_ONLINE' | 'DINHEIRO' | 'CARTAO_ENTREGA' | 'PIX_ENTREGA';

const FORMAS: Array<{ valor: FormaDePagamento; titulo: string; detalhe: string }> = [
  {
    valor: 'PIX_ONLINE',
    titulo: 'Pix online, pago antes',
    detalhe: 'O cliente paga na hora do pedido, direto na sua conta Asaas.',
  },
  {
    valor: 'DINHEIRO',
    titulo: 'Dinheiro na entrega',
    detalhe: 'O cliente informa para quanto precisa de troco.',
  },
  {
    valor: 'CARTAO_ENTREGA',
    titulo: 'Cartão na entrega',
    detalhe: 'Exige maquininha indo junto com o motoboy.',
  },
  {
    valor: 'PIX_ENTREGA',
    titulo: 'Pix na entrega',
    detalhe: 'O cliente mostra o comprovante na porta. O risco de golpe é seu.',
  },
];

export default function LojaConfiguracoesPage() {
  const [slug, setSlug] = useState('minha-loja');
  const [copiado, setCopiado] = useState(false);

  const [tema, setTema] = useState<TemaDaLoja>('CLARO');
  /*
   * O padrão tem que PASSAR na própria verificação da tela. O laranja anterior
   * (#f97316) dava 2,8 sobre branco e disparava o aviso antes de a lojista
   * tocar em nada — e um aviso que já nasce aceso ensina a ignorá-lo.
   */
  const [corDaMarca, setCorDaMarca] = useState('#c2410c');
  const [corDeAcao, setCorDeAcao] = useState('#16a34a');

  const [asaasConfigurado] = useState(false);
  const [formas, setFormas] = useState<FormaDePagamento[]>(['DINHEIRO']);
  const [preparo, setPreparo] = useState('20');
  const [entradaAutomatica, setEntradaAutomatica] = useState(true);
  const [pausada, setPausada] = useState(false);
  const [pedidoMinimo, setPedidoMinimo] = useState('15,00');
  const [aceitaRetirada, setAceitaRetirada] = useState(LOJA_DE_EXEMPLO.aceitaRetirada);
  const [avisoSonoro, setAvisoSonoro] = useState(LOJA_DE_EXEMPLO.avisoSonoro);
  const [avisoPush, setAvisoPush] = useState(LOJA_DE_EXEMPLO.avisoPush);

  const [diasFechados, setDiasFechados] = useState<Array<DiaFechado & { id: string }>>(
    LOJA_DE_EXEMPLO.diasFechados.map((dia) => ({ ...dia, id: novoId() })),
  );

  function alterarDiaFechado(id: string, campo: 'data' | 'motivo', valor: string) {
    setDiasFechados((atual) =>
      atual.map((dia) => (dia.id === id ? { ...dia, [campo]: valor } : dia)),
    );
  }

  const coleta = LOJA_DE_EXEMPLO.pontoDeColeta;

  const [bairros, setBairros] = useState<LinhaDeBairro[]>(
    LOJA_DE_EXEMPLO.bairros.map((bairro) => ({
      id: bairro.id,
      nome: bairro.nome,
      taxa: bairro.taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    })),
  );

  const [semana, setSemana] = useState<LinhaDeDia[]>(
    LOJA_DE_EXEMPLO.semana.map((dia) => ({
      dia: dia.dia,
      faixas: dia.faixas.map((faixa) => ({ id: novoId(), abre: faixa.abre, fecha: faixa.fecha })),
    })),
  );

  function alterarBairro(id: string, campo: 'nome' | 'taxa', valor: string) {
    setBairros((atual) =>
      atual.map((bairro) => (bairro.id === id ? { ...bairro, [campo]: valor } : bairro)),
    );
  }

  function alterarFaixa(dia: number, id: string, campo: 'abre' | 'fecha', valor: string) {
    setSemana((atual) =>
      atual.map((linha) =>
        linha.dia === dia
          ? {
              ...linha,
              faixas: linha.faixas.map((faixa) =>
                faixa.id === id ? { ...faixa, [campo]: valor } : faixa,
              ),
            }
          : linha,
      ),
    );
  }

  function acrescentarFaixa(dia: number) {
    setSemana((atual) =>
      atual.map((linha) =>
        linha.dia === dia
          ? { ...linha, faixas: [...linha.faixas, { id: novoId(), abre: '18:00', fecha: '22:00' }] }
          : linha,
      ),
    );
  }

  function removerFaixa(dia: number, id: string) {
    setSemana((atual) =>
      atual.map((linha) =>
        linha.dia === dia
          ? { ...linha, faixas: linha.faixas.filter((faixa) => faixa.id !== id) }
          : linha,
      ),
    );
  }

  /*
   * Faixa que fecha antes de abrir não é erro de digitação inofensivo: a loja
   * fica declarada aberta num intervalo vazio e não recebe pedido nenhum, sem
   * nada na tela explicando por quê.
   */
  const faixasInvertidas = semana.flatMap((linha) =>
    linha.faixas
      .filter((faixa) => faixa.fecha <= faixa.abre)
      .map(() => DIAS_DA_SEMANA[linha.dia] ?? ''),
  );

  const semDiaAberto = semana.every((linha) => linha.faixas.length === 0);

  const url = `${DOMINIO}/${slug}`;

  function alternarForma(valor: FormaDePagamento) {
    setFormas((atual) =>
      atual.includes(valor) ? atual.filter((item) => item !== valor) : [...atual, valor],
    );
  }

  /**
   * Medido contra o FUNDO DA LOJA no tema escolhido, e não contra branco fixo.
   * No tema escuro a régua inverte: um tom claro passa e um escuro some. Medir
   * sempre contra branco aprovaria justamente a cor que ninguém enxerga.
   *
   * A cor da marca vira TEXTO (o preço em destaque), então a régua é 4.5. A de
   * ação vira FUNDO de botão — o texto por cima é calculado e nunca falha; o
   * que pode falhar é o botão sumir contra a página, e aí a régua é 3.
   */
  const avisos = [
    {
      nome: 'cor da marca',
      uso: 'ela é usada no preço, como texto',
      valor: contrasteComAPagina(corDaMarca, tema),
      minimo: MINIMO_PARA_TEXTO,
    },
    {
      nome: 'cor de ação',
      uso: 'o botão quase some contra o fundo da página',
      valor: contrasteComAPagina(corDeAcao, tema),
      minimo: MINIMO_PARA_BOTAO,
    },
  ].filter((item) => item.valor !== null && item.valor < item.minimo);

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Configurações da loja</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Como sua página de pedidos aparece e como você recebe.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          Tela de demonstração. Nada é salvo — serve para aprovar o desenho antes de ligar ao
          sistema.
        </CardContent>
      </Card>

      {/* 1. O link é o que a loja divulga. É o campo mais consequente da tela. */}
      <Card>
        <CardHeader>
          <CardTitle>Link da sua loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="slug">Endereço</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{DOMINIO}/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                autoCapitalize="none"
                className="max-w-56"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(`https://${url}`)
                    .then(() => setCopiado(true))
                    .catch(() => setCopiado(false));
                }}
              >
                {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />É este endereço que
            você manda no WhatsApp, põe no QR da mesa e na bio do Instagram.
          </p>

          {/* A lição que o código da central já deu: slug sem troca vira papel
              morto quando a loja muda de nome. */}
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            Se você trocar o endereço, o antigo continua funcionando e redireciona para o novo — seu
            panfleto e seu QR não deixam de valer.
          </p>
        </CardContent>
      </Card>

      {/* 2. Identidade visual: duas cores livres, o resto calculado. */}
      <Card>
        <CardHeader>
          <CardTitle>Identidade visual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <label
              htmlFor="logo"
              className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Enviar logo
            </label>
            <input id="logo" type="file" accept="image/*" className="sr-only" />
            <p className="text-xs text-muted-foreground">
              A logo pesa mais que as cores: com ela, a página já parece a sua loja.
            </p>
          </div>

          {/* Vem antes das cores de proposito: o tema define o fundo, e é
              contra esse fundo que as duas cores abaixo são medidas. Trocar o
              tema depois muda quem passa e quem reprova. */}
          <div className="space-y-2">
            <p className="text-sm font-medium" id="rotuloTema">
              Tema da página
            </p>
            <div role="radiogroup" aria-labelledby="rotuloTema" className="flex gap-2">
              {TEMAS.map((item) => (
                <label
                  key={item.valor}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                    tema === item.valor
                      ? 'border-primary bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="tema"
                    value={item.valor}
                    checked={tema === item.valor}
                    onChange={() => setTema(item.valor)}
                    className="sr-only"
                  />
                  {item.texto}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="corMarca">Cor da marca</Label>
              <div className="flex items-center gap-2">
                <input
                  id="corMarca"
                  type="color"
                  value={corDaMarca}
                  onChange={(event) => setCorDaMarca(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border"
                />
                <Input
                  value={corDaMarca}
                  onChange={(event) => setCorDaMarca(event.target.value)}
                  aria-label="Cor da marca em hexadecimal"
                />
              </div>
              <p className="text-xs text-muted-foreground">Cabeçalho, preço em destaque.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="corAcao">Cor de ação</Label>
              <div className="flex items-center gap-2">
                <input
                  id="corAcao"
                  type="color"
                  value={corDeAcao}
                  onChange={(event) => setCorDeAcao(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border"
                />
                <Input
                  value={corDeAcao}
                  onChange={(event) => setCorDeAcao(event.target.value)}
                  aria-label="Cor de ação em hexadecimal"
                />
              </div>
              <p className="text-xs text-muted-foreground">Botão de adicionar e de finalizar.</p>
            </div>
          </div>

          {/* Escolher cor num formulário às cegas dá resultado ruim quase
              sempre. A prévia não é enfeite: é o que mostra o estrago antes de
              o cliente ver. */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Prévia</p>
            <div className="overflow-hidden rounded-xl border">
              <div
                className="px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: corDaMarca, color: textoSobre(corDaMarca) }}
              >
                Minha Loja
              </div>
              <div
                className="flex items-center justify-between gap-3 p-4"
                style={{ backgroundColor: fundoDoTema(tema), color: textoSobre(fundoDoTema(tema)) }}
              >
                <div>
                  <p className="text-sm font-medium">Açaí 500ml</p>
                  <p className="text-sm font-semibold" style={{ color: corDaMarca }}>
                    R$ 18,00
                  </p>
                </div>
                <span
                  className="rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
                >
                  Adicionar
                </span>
              </div>
            </div>
          </div>

          {avisos.map((item) => (
            <p
              key={item.nome}
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                A <strong>{item.nome}</strong> não se separa do fundo: {item.uso}. Contraste{' '}
                {item.valor?.toFixed(1).replace('.', ',')}, e o mínimo é{' '}
                {item.minimo.toFixed(1).replace('.', ',')}. Escolha um tom mais{' '}
                {tema === 'ESCURO' ? 'claro' : 'escuro'}.
              </span>
            </p>
          ))}

          {/* A confusão provável é achar que estas cores mexem no painel.
              Elas não o tocam: valem na loja que o cliente abre. */}
          <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            Estas cores valem na página da sua loja, e não neste painel. Quando o cliente instalar a
            loja no celular, a cor da marca também vira a cor da barra do navegador e da tela de
            abertura.
          </p>
        </CardContent>
      </Card>

      {/* 3. Formas de pagamento, com as regras do plano valendo na tela. */}
      <Card>
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {FORMAS.map((forma) => {
            const exigeAsaas = forma.valor === 'PIX_ONLINE';
            const bloqueada = exigeAsaas && !asaasConfigurado;
            const marcada = formas.includes(forma.valor);
            const ultima = marcada && formas.length === 1;

            return (
              <label
                key={forma.valor}
                className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                  bloqueada ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={marcada}
                  disabled={bloqueada || ultima}
                  onCheckedChange={() => alternarForma(forma.valor)}
                />
                <span>
                  {forma.titulo}
                  <span className="block text-xs text-muted-foreground">{forma.detalhe}</span>
                  {bloqueada && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Cadastre sua conta Asaas abaixo para poder oferecer esta forma.
                    </span>
                  )}
                  {ultima && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Pelo menos uma forma precisa ficar marcada, senão o cliente não consegue
                      fechar o pedido.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      {/* 4. Recebimento: a loja recebe na PRÓPRIA conta; a plataforma não toca
          no dinheiro de ninguém. */}
      <Card>
        <CardHeader>
          <CardTitle>Recebimento pelo Asaas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O cliente paga <strong>direto na sua conta</strong>. A central continua cobrando as
            entregas na fatura, como hoje — o dinheiro da venda nunca passa por ela.
          </p>

          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            Nenhuma conta cadastrada. Sem ela, o Pix online fica indisponível e você recebe na
            entrega, em dinheiro ou maquininha.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asaasKey">Chave de API</Label>
              <Input id="asaasKey" type="password" autoComplete="off" placeholder="$aact_..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asaasAmbiente">Ambiente</Label>
              <select
                id="asaasAmbiente"
                defaultValue="sandbox"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="sandbox">Sandbox (teste)</option>
                <option value="production">Produção (dinheiro real)</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A chave é gravada cifrada e nunca volta para esta tela — depois de salva, aparece aqui
            só o ambiente e os quatro últimos caracteres.
          </p>
        </CardContent>
      </Card>

      {/* 5. Entrada dos pedidos. Vem antes do preparo de propósito: o preparo
          só significa "janela para cancelar" quando a entrada é automática. */}
      <Card>
        <CardHeader>
          <CardTitle>Entrada dos pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={entradaAutomatica}
              onCheckedChange={(valor) => setEntradaAutomatica(valor === true)}
            />
            <span>
              Aceitar os pedidos automaticamente
              <span className="block text-xs text-muted-foreground">
                O pedido entra na fila sozinho e o motoboy é chamado quando o preparo vence.
              </span>
            </span>
          </label>

          {entradaAutomatica ? (
            <p className="text-xs text-muted-foreground">
              Ninguém precisa ficar olhando a tela. Se não for dar conta de um pedido, você tem o
              tempo de preparo para cancelar.
            </p>
          ) : (
            /* O modo manual troca um problema por outro, e a tela diz qual. */
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <p>
                <strong>Cada pedido vai esperar você confirmar.</strong> Se ninguém estiver olhando
                a tela, o cliente espera sem saber — e o motoboy só é chamado depois da sua
                confirmação.
              </p>
              <p>
                Você deixa de ter a janela de cancelamento: ela é o preparo correndo antes do
                despacho, e aqui nada corre até você confirmar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Preparo. */}
      <Card>
        <CardHeader>
          <CardTitle>Tempo de preparo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-40 space-y-2">
            <Label htmlFor="preparo">Minutos</Label>
            <Input
              id="preparo"
              type="number"
              min={1}
              value={preparo}
              onChange={(event) => setPreparo(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {entradaAutomatica
              ? 'O pedido entra na fila e o motoboy só é chamado quando esse tempo vence. É também a janela em que você consegue cancelar — depois dela, o pedido já virou entrega.'
              : 'O motoboy é chamado esse tempo depois de você confirmar o pedido. É o que o cliente vê como previsão na página.'}
          </p>
          <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            Sua página só aceita pedido dentro do horário de funcionamento. Sem isso, um pedido de
            madrugada chamaria motoboy para loja fechada.
          </p>
        </CardContent>
      </Card>

      {/* 7. Horário. É ele que decide se a página aceita pedido agora. */}
      <Card>
        <CardHeader>
          <CardTitle>Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Fora desses horários, sua página mostra o cardápio mas não deixa fechar pedido. É o que
            evita um pedido de madrugada chamando motoboy para loja fechada.
          </p>

          {semana.map((linha) => (
            <div key={linha.dia} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-sm font-medium">{DIAS_DA_SEMANA[linha.dia]}</span>
                {linha.faixas.length === 0 && (
                  <span className="text-sm text-muted-foreground">Fechado o dia todo</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => acrescentarFaixa(linha.dia)}
                >
                  <Plus className="size-4" /> Horário
                </Button>
              </div>

              {/* Duas faixas no mesmo dia porque almoço e janta é o comum. Com
                  uma faixa só, quem fecha das 14h às 18h seria obrigado a
                  declarar um horário que não pratica. */}
              {linha.faixas.map((faixa) => (
                <div key={faixa.id} className="flex flex-wrap items-center gap-2 pl-20">
                  <Input
                    type="time"
                    value={faixa.abre}
                    onChange={(evento) =>
                      alterarFaixa(linha.dia, faixa.id, 'abre', evento.target.value)
                    }
                    aria-label={DIAS_DA_SEMANA[linha.dia] + ': abre às'}
                    className="max-w-32"
                  />
                  <span className="text-sm text-muted-foreground">às</span>
                  <Input
                    type="time"
                    value={faixa.fecha}
                    onChange={(evento) =>
                      alterarFaixa(linha.dia, faixa.id, 'fecha', evento.target.value)
                    }
                    aria-label={DIAS_DA_SEMANA[linha.dia] + ': fecha às'}
                    className="max-w-32"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={'Remover horário de ' + DIAS_DA_SEMANA[linha.dia]}
                    onClick={() => removerFaixa(linha.dia, faixa.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ))}

          {faixasInvertidas.length > 0 && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                Em <strong>{[...new Set(faixasInvertidas)].join(', ')}</strong> o horário de fechar
                não é depois do de abrir. Do jeito que está, a loja nunca abre nesse dia.
              </span>
            </p>
          )}

          {semDiaAberto && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              Nenhum dia com horário: sua página não aceita pedido em dia nenhum.
            </p>
          )}

          {/* O horário da semana não sabe o que é 25 de dezembro. */}
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Dias fechados</p>
            {diasFechados.map((dia) => (
              <div key={dia.id} className="grid gap-2 sm:grid-cols-[170px_1fr_40px]">
                <Input
                  type="date"
                  value={dia.data}
                  onChange={(evento) => alterarDiaFechado(dia.id, 'data', evento.target.value)}
                  aria-label="Data fechada"
                />
                <Input
                  value={dia.motivo}
                  onChange={(evento) => alterarDiaFechado(dia.id, 'motivo', evento.target.value)}
                  aria-label="Motivo"
                  placeholder="Feriado, férias, reforma"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={'Remover ' + (dia.motivo || dia.data)}
                  onClick={() => setDiasFechados((atual) => atual.filter((d) => d.id !== dia.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDiasFechados((atual) => [...atual, { id: novoId(), data: '', motivo: '' }])
              }
            >
              <Plus className="size-4" /> Acrescentar dia
            </Button>
            <p className="text-xs text-muted-foreground">
              Nesses dias a loja não aceita pedido, seja qual for o horário. O motivo aparece para o
              cliente, para ele não achar que a página quebrou.
            </p>
          </div>

          {/* A exceção que o horário não cobre, e que é o botão mais usado numa
              noite ruim. */}
          <label className="flex items-start gap-2.5 border-t pt-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={pausada}
              onCheckedChange={(valor) => setPausada(valor === true)}
            />
            <span>
              Fechar a loja agora
              <span className="block text-xs text-muted-foreground">
                Vale por cima do horário. Para quando acabou ingrediente, a cozinha encheu ou está
                chovendo demais — sem precisar mexer no horário e lembrar de desfazer depois.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* 8. Bairros e taxas, no lugar da taxa única. */}
      <Card>
        <CardHeader>
          <CardTitle>Bairros que você atende</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            O cliente escolhe o bairro no checkout e a taxa entra no total. Bairro que não está aqui
            não aparece para ele — <strong>é assim que você limita sua área de entrega</strong>.
          </p>

          <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_140px_40px]">
            <span>Bairro</span>
            <span>Taxa</span>
            <span />
          </div>

          {bairros.map((bairro) => (
            <div
              key={bairro.id}
              className="grid gap-2 sm:grid-cols-[1fr_140px_40px] sm:items-center"
            >
              <Input
                value={bairro.nome}
                onChange={(evento) => alterarBairro(bairro.id, 'nome', evento.target.value)}
                aria-label="Nome do bairro"
                placeholder="Centro"
              />
              <Input
                value={bairro.taxa}
                onChange={(evento) => alterarBairro(bairro.id, 'taxa', evento.target.value)}
                inputMode="decimal"
                aria-label={'Taxa de ' + (bairro.nome || 'bairro sem nome')}
                placeholder="8,00"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={'Remover ' + (bairro.nome || 'bairro sem nome')}
                onClick={() => setBairros((atual) => atual.filter((item) => item.id !== bairro.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBairros((atual) => [...atual, { id: novoId(), nome: '', taxa: '' }])}
          >
            <Plus className="size-4" /> Acrescentar bairro
          </Button>

          {bairros.length === 0 ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              Sem bairro nenhum, sua página não tem como calcular a entrega e não aceita pedido.
              Cadastre ao menos um.
            </p>
          ) : (
            /* Confundir os dois valores é o erro provável, e ele custa dinheiro
               da loja em toda entrega. */
            <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              Estes valores são o que <strong>você cobra do cliente</strong>, e não o que a central
              cobra de você. São números independentes: cobre mais, menos ou nada, que a entrega
              continua entrando na sua fatura do mesmo jeito.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 9. Pedido mínimo. */}
      <Card>
        <CardHeader>
          <CardTitle>Pedido mínimo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-40 space-y-2">
            <Label htmlFor="pedidoMinimo">Valor mínimo</Label>
            <Input
              id="pedidoMinimo"
              inputMode="decimal"
              value={pedidoMinimo}
              onChange={(evento) => setPedidoMinimo(evento.target.value)}
              placeholder="sem mínimo"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Conta só os itens, sem a entrega. Deixe vazio para não exigir. Sem mínimo, um sorvete de
            R$ 6,00 pode sair com R$ 8,00 de taxa — e a diferença sai do seu bolso.
          </p>
        </CardContent>
      </Card>

      {/* 10. De onde o motoboy retira. NÃO é campo desta tela. */}
      <Card>
        <CardHeader>
          <CardTitle>De onde o motoboy retira</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {coleta.rua}, {coleta.numero}
              {coleta.complemento ? ` — ${coleta.complemento}` : ''}
              <span className="block text-muted-foreground">
                {coleta.bairro}, {coleta.cidade}/{coleta.estado}
              </span>
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            É o mesmo ponto de coleta que a sua empresa já usa nos pedidos do painel, e não uma
            configuração separada da loja. Para alterar, mude o endereço da empresa — a loja
            acompanha.
          </p>
        </CardContent>
      </Card>

      {/* 11. Retirada: pedido sem entrega, e sem taxa. */}
      <Card>
        <CardHeader>
          <CardTitle>Retirada na loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={aceitaRetirada}
              onCheckedChange={(valor) => setAceitaRetirada(valor === true)}
            />
            <span>
              Deixar o cliente buscar na loja
              <span className="block text-xs text-muted-foreground">
                No checkout ele escolhe entre entrega e retirada. Na retirada não há taxa, não há
                endereço a preencher e nenhum motoboy é chamado.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            O endereço acima é o que aparece para o cliente saber onde buscar.
          </p>
        </CardContent>
      </Card>

      {/* 12. Avisos. O que funciona e o que ainda não, dito na tela. */}
      <Card>
        <CardHeader>
          <CardTitle>Avisos de pedido novo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={avisoSonoro}
              onCheckedChange={(valor) => setAvisoSonoro(valor === true)}
            />
            <span>
              Tocar um som quando entrar pedido
              <span className="block text-xs text-muted-foreground">
                Só toca com esta página aberta em alguma aba. Fechou o navegador, não toca.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={avisoPush}
              onCheckedChange={(valor) => setAvisoPush(valor === true)}
            />
            <span>
              Notificação no celular, mesmo com o painel fechado
              <span className="block text-xs text-muted-foreground">
                É o que resolve o caso real: o pedido chega enquanto ninguém está olhando a tela.
              </span>
            </span>
          </label>

          {/* Dizer o que falta é mais honesto do que um botão que não faz
              nada. O push do motoboy é Android via Firebase; alertar a loja é
              outro caminho e ainda não existe. */}
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <Bell className="mt-0.5 size-3.5 shrink-0 text-amber-700" aria-hidden="true" />
            <span>
              A notificação ainda não está construída. O push que já existe no sistema é o do
              aplicativo do motoboy, no Android; avisar o painel é pelo navegador, e depende de o
              navegador pedir sua permissão. Enquanto isso, vale o som — com a aba aberta.
            </span>
          </p>

          {!entradaAutomatica && !avisoPush && (
            /* No modo manual o pedido espera confirmação. Sem aviso que
               atravesse a aba fechada, ele espera até alguém lembrar de
               olhar — e o cliente espera junto. */
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
              Você desligou a aceitação automática, então todo pedido espera você confirmar. Sem
              notificação, ninguém é avisado quando um chega.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled>
          Salvar configurações
        </Button>
        <span className="text-xs text-muted-foreground">
          Desativado enquanto a tela não está ligada ao sistema.
        </span>
      </div>
    </div>
  );
}
