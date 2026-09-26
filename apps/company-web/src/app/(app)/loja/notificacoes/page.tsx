'use client';

import { useState } from 'react';
import { AlertCircle, Bell, Smartphone, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  mostrarNotificacao,
  pedirPermissaoDeNotificacao,
  permissaoDeNotificacao,
  testarSom,
  type PermissaoDeNotificacao,
} from '@/lib/avisos-do-navegador';
import {
  EVENTOS_DO_CLIENTE,
  EVENTOS_DO_CLIENTE_OBRIGATORIOS,
  EVENTOS_DO_LOJISTA,
  avisoParaOCliente,
  type EventoDoLojista,
} from '@/lib/loja-avisos';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { AvisosNoAparelho } from '@/components/loja/avisos-no-aparelho';
import { mesmoConteudo, useGravarOperacao, useOperacaoDaLoja } from '@/components/loja/operacao';
import { companyStoreOperationApi } from '@/lib/api-client';
import type { OperacaoDaLoja } from '@/lib/loja-operacao';
import { useAgora } from '@/lib/relogio';

/**
 * Os avisos: o que chega para a loja, e o que chega para o cliente.
 *
 * Diz na tela o que já funciona e o que não. Com o painel aberto em alguma aba,
 * o próprio painel toca e notifica. Com ele fechado, o aviso chega pelo Web
 * Push, no aparelho que ligou "Avisar neste aparelho" — e só se o servidor
 * tiver as chaves; sem elas, o cartão diz isso, em vez de oferecer um botão que
 * não faz nada.
 */

type Notificacoes = OperacaoDaLoja['notificacoes'];

const ANTECEDENCIAS_DO_FECHAMENTO = [5, 10, 15, 30];

export default function LojaNotificacoesPage() {
  const consulta = useOperacaoDaLoja();
  const operacao = consulta.data;
  const instante = useAgora();
  const [versao, setVersao] = useState(0);

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Notificações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem fica sabendo do quê: você, quando o pedido chega; o cliente, a cada passo dele.
        </p>
      </header>

      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          As escolhas são salvas no sistema e valem para o painel aberto e para os avisos com a
          página fechada, nos aparelhos em que eles forem ligados.
        </CardContent>
      </Card>

      {consulta.isError && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">Não foi possível carregar as notificações.</p>
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
      {!operacao && !consulta.isError && (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      )}
      {instante !== 0 && operacao && (
        <Formulario
          key={versao}
          operacao={operacao}
          onDescartar={() => setVersao((atual) => atual + 1)}
        />
      )}
    </div>
  );
}

function Formulario({
  operacao,
  onDescartar,
}: {
  operacao: OperacaoDaLoja;
  onDescartar: () => void;
}) {
  const [rascunho, setRascunho] = useState<Notificacoes>(operacao.notificacoes);
  const [permissao, setPermissao] = useState<PermissaoDeNotificacao>(permissaoDeNotificacao);
  const [testado, setTestado] = useState<string | null>(null);

  const mudou = !mesmoConteudo(rascunho, operacao.notificacoes);
  const salvar = useGravarOperacao(companyStoreOperationApi.updateNotifications);
  const manual = operacao.recebimento.modo === 'MANUAL';
  const novoPedido = rascunho.lojista.NOVO_PEDIDO;

  function mudarLojista(evento: EventoDoLojista, canal: 'push' | 'som', valor: boolean) {
    setRascunho((atual) => ({
      ...atual,
      lojista: { ...atual.lojista, [evento]: { ...atual.lojista[evento], [canal]: valor } },
    }));
  }

  async function permitir() {
    setPermissao(await pedirPermissaoDeNotificacao());
  }

  async function testarNotificacao() {
    const mostrou = await mostrarNotificacao('Novo pedido', {
      corpo: '#1607 · Cliente de teste · R$ 32,90 · entrega',
      etiqueta: 'teste',
    });
    setTestado(mostrou ? 'Notificação enviada.' : 'O navegador não mostrou a notificação.');
  }

  async function testarOSom() {
    const tocou = await testarSom('pedido');
    setTestado(tocou ? 'Tocou o som de pedido novo.' : 'Este navegador não conseguiu tocar som.');
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-5 text-muted-foreground" aria-hidden="true" /> Para você
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Colunas no computador; no celular, as duas caixas descem para
              baixo do texto, cada uma com o nome — uma tabela ali esconderia a
              coluna do som atrás de uma rolagem de lado. */}
          <div className="text-sm">
            <div className="hidden grid-cols-[1fr_7rem_7rem] pb-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Quando</span>
              <span className="text-center">Notificação</span>
              <span className="text-center">Som no painel</span>
            </div>
            {EVENTOS_DO_LOJISTA.map((evento) => (
              <div
                key={evento.valor}
                className="grid gap-2 border-t py-3 sm:grid-cols-[1fr_7rem_7rem] sm:items-start"
              >
                <div>
                  {evento.titulo}
                  <span className="block text-xs text-muted-foreground">{evento.detalhe}</span>
                  {evento.valor === 'PAGAMENTO_RECEBIDO' && (
                    <span className="block text-xs text-muted-foreground">
                      Depende da integração com o Asaas, que ainda não existe.
                    </span>
                  )}
                  {evento.valor === 'LOJA_FECHANDO' && (
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      Avisar
                      <select
                        value={rascunho.minutosAntesDeFechar}
                        onChange={(e) =>
                          setRascunho((atual) => ({
                            ...atual,
                            minutosAntesDeFechar: Number(e.target.value),
                          }))
                        }
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        aria-label="Quantos minutos antes de fechar"
                      >
                        {ANTECEDENCIAS_DO_FECHAMENTO.map((minutos) => (
                          <option key={minutos} value={minutos}>
                            {minutos} min
                          </option>
                        ))}
                      </select>
                      antes de fechar
                    </label>
                  )}
                </div>
                <div className="flex gap-5 sm:contents">
                  <label className="flex items-center gap-2 text-xs sm:justify-center">
                    <Checkbox
                      checked={rascunho.lojista[evento.valor].push}
                      onCheckedChange={(valor) =>
                        mudarLojista(evento.valor, 'push', valor === true)
                      }
                      aria-label={`Notificação: ${evento.titulo}`}
                    />
                    <span className="sm:sr-only">Notificação</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs sm:justify-center">
                    <Checkbox
                      checked={rascunho.lojista[evento.valor].som}
                      onCheckedChange={(valor) => mudarLojista(evento.valor, 'som', valor === true)}
                      aria-label={`Som: ${evento.titulo}`}
                    />
                    <span className="sm:sr-only">Som no painel</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2.5 border-t pt-3 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={rascunho.repetirSom}
              onCheckedChange={(valor) =>
                setRascunho((atual) => ({ ...atual, repetirSom: valor === true }))
              }
            />
            <span>
              Repetir o som enquanto houver pedido esperando aceite
              <span className="block text-xs text-muted-foreground">
                A cada 30 segundos, até alguém aceitar ou recusar. Um toque só se perde no barulho
                da cozinha.
              </span>
            </span>
          </label>

          {/* Permissão e teste: sem isso a lojista só descobre que o aviso
              não funciona no dia em que perde um pedido. */}
          <div className="space-y-3 rounded-lg bg-muted/50 p-3 text-sm">
            <p className="text-xs">
              {permissao === 'granted' && 'Notificações permitidas neste navegador.'}
              {permissao === 'default' && 'O navegador ainda não deu permissão para notificar.'}
              {permissao === 'denied' &&
                'Notificações bloqueadas neste navegador. Libere nas permissões do site — o cadeado ao lado do endereço.'}
              {permissao === 'indisponivel' && 'Este navegador não mostra notificações.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {permissao === 'default' && (
                <Button type="button" size="sm" onClick={permitir}>
                  <Bell className="size-4" /> Permitir notificações
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={permissao !== 'granted'}
                onClick={testarNotificacao}
              >
                Testar notificação
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={testarOSom}>
                <Volume2 className="size-4" /> Testar som
              </Button>
            </div>
            {testado && (
              <p role="status" className="text-xs text-muted-foreground">
                {testado}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Com o painel aberto em alguma aba, mesmo em segundo plano, ele avisa sozinho. Para
              avisar com ele fechado, ligue o aparelho no cartão abaixo. O som só toca depois do
              primeiro clique na página: é regra dos navegadores.
            </p>
          </div>

          {manual && !novoPedido.push && !novoPedido.som && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
              <AlertCircle
                className="mt-0.5 size-3.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              O aceite está manual, então todo pedido espera você aceitar. Sem notificação nem som
              de pedido novo, ninguém fica sabendo quando um chega.
            </p>
          )}
        </CardContent>
      </Card>

      <AvisosNoAparelho />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-muted-foreground" aria-hidden="true" /> Para o
            cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Chega no celular do cliente se ele permitir os avisos na página da loja. Com ou sem
            permissão, ele acompanha cada etapa em Meus pedidos.
          </p>

          {EVENTOS_DO_CLIENTE.map((evento) => {
            const obrigatorio = EVENTOS_DO_CLIENTE_OBRIGATORIOS.includes(evento.valor);
            return (
              <label key={evento.valor} className="flex items-start gap-2.5 border-t pt-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={obrigatorio || rascunho.cliente[evento.valor]}
                  disabled={obrigatorio}
                  onCheckedChange={(valor) =>
                    setRascunho((atual) => ({
                      ...atual,
                      cliente: { ...atual.cliente, [evento.valor]: valor === true },
                    }))
                  }
                />
                <span>
                  {evento.titulo}
                  <span className="block text-xs text-muted-foreground">{evento.detalhe}</span>
                  <span className="mt-1 block text-xs italic text-muted-foreground">
                    “
                    {avisoParaOCliente(
                      evento.valor,
                      1607,
                      evento.valor === 'PRONTO_PARA_RETIRAR' ? 'RETIRADA' : 'ENTREGA',
                    )}
                    ”
                  </span>
                </span>
              </label>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Com a página fechada, chega para o cliente que tocou em &quot;Avisar quando o pedido
            andar&quot;, em Meus pedidos, depois de pedir.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!mudou || salvar.isPending}
          onClick={() => salvar.mutate(rascunho)}
        >
          {salvar.isPending ? 'Salvando...' : 'Salvar notificações'}
        </Button>
        {mudou && (
          <Button type="button" variant="ghost" onClick={onDescartar}>
            Descartar alterações
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {mudou ? 'Há alterações não salvas.' : 'Tudo salvo.'}
        </span>
      </div>
      {salvar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {mensagemDoErro(salvar.error, 'Não foi possível salvar as notificações.')}
        </p>
      )}
    </>
  );
}
