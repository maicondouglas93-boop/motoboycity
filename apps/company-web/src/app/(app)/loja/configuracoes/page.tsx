'use client';

import { useState } from 'react';
import { AlertCircle, Check, Copy, ImagePlus, Link2, MapPin, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FORMAS_DE_PAGAMENTO,
  GRUPOS_DE_PAGAMENTO,
  LOJA_DE_EXEMPLO,
  type FormaDePagamento,
} from '@/lib/loja-mock';
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

function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const TEMAS: Array<{ valor: TemaDaLoja; texto: string }> = [
  { valor: 'CLARO', texto: 'Claro' },
  { valor: 'ESCURO', texto: 'Escuro' },
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

  const asaasConfigurado = LOJA_DE_EXEMPLO.asaasConfigurado;
  const [formas, setFormas] = useState<FormaDePagamento[]>(LOJA_DE_EXEMPLO.pagamentos);
  const efetivas = formas.filter(
    (valor) =>
      asaasConfigurado ||
      FORMAS_DE_PAGAMENTO.find((forma) => forma.valor === valor)?.grupo !== 'ONLINE',
  );
  const coleta = LOJA_DE_EXEMPLO.pontoDeColeta;

  const [bairros, setBairros] = useState<LinhaDeBairro[]>(
    LOJA_DE_EXEMPLO.bairros.map((bairro) => ({
      id: bairro.id,
      nome: bairro.nome,
      taxa: bairro.taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    })),
  );

  function alterarBairro(id: string, campo: 'nome' | 'taxa', valor: string) {
    setBairros((atual) =>
      atual.map((bairro) => (bairro.id === id ? { ...bairro, [campo]: valor } : bairro)),
    );
  }

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
          O link, a aparência, o pagamento e a área de entrega. Horário, tipos de pedido e avisos
          têm telas próprias, no menu ao lado.
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

      {/* 3. Formas de pagamento, em dois grupos: pagar agora ou pagar na
          entrega. A mesma lista que o checkout mostra ao cliente. */}
      <Card>
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {(['ONLINE', 'ENTREGA'] as const).map((grupo) => {
            const doGrupo = FORMAS_DE_PAGAMENTO.filter((forma) => forma.grupo === grupo);
            // O grupo online inteiro depende da conta Asaas: sem ela, não há
            // para onde o dinheiro ir. Um aviso para o grupo, e não um por forma.
            const grupoBloqueado = grupo === 'ONLINE' && !asaasConfigurado;

            return (
              <fieldset key={grupo} className="space-y-2">
                <legend className="mb-1">
                  <span className="block text-sm font-semibold">
                    {GRUPOS_DE_PAGAMENTO[grupo].titulo}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {GRUPOS_DE_PAGAMENTO[grupo].detalhe}
                  </span>
                </legend>

                {grupoBloqueado && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                    Cadastre sua conta Asaas abaixo para poder receber online.
                  </p>
                )}

                {doGrupo.map((forma) => {
                  const marcada = formas.includes(forma.valor);
                  // Conta só as formas que valem de verdade: online marcada com
                  // o Asaas desligado não chega ao cliente, e contá-la deixaria
                  // desmarcar a última forma que ele de fato enxerga.
                  const ultima = marcada && !grupoBloqueado && efetivas.length === 1;

                  return (
                    <label
                      key={forma.valor}
                      className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                        grupoBloqueado ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={marcada && !grupoBloqueado}
                        disabled={grupoBloqueado || ultima}
                        onCheckedChange={() => alternarForma(forma.valor)}
                      />
                      <span>
                        {forma.titulo}
                        <span className="block text-xs text-muted-foreground">{forma.detalhe}</span>
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

                {/* A maquininha é da loja, e o motoboy é da central. Quem marca
                    essas opções precisa saber que a máquina sai com a entrega —
                    e tem que voltar. */}
                {grupo === 'ENTREGA' && formas.some((forma) => forma.endsWith('_MAQUININHA')) && (
                  <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                    As opções na maquininha exigem que a sua máquina vá com o motoboy até o cliente
                    — e volte com ele para a loja.
                  </p>
                )}
              </fieldset>
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

          {asaasConfigurado ? (
            /* A chave nunca volta para a tela depois de salva: aparece só o
               ambiente e o final, para a loja reconhecer qual conta é. */
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
              Conta cadastrada · ambiente Sandbox · chave terminando em ••••a1b2. Para trocar, cole
              uma chave nova abaixo.
            </p>
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              Nenhuma conta cadastrada. Sem ela, nenhuma forma online fica disponível e você recebe
              só na entrega, em dinheiro ou maquininha.
            </p>
          )}

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

      {/* 5. Bairros e taxas, no lugar da taxa única. */}
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

      {/* 6. De onde o motoboy retira. NÃO é campo desta tela. */}
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
