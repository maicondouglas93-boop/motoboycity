'use client';

import { useState } from 'react';
import type { FormaDePagamento } from '@motoboycity/types';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { useGravarOperacao, useOperacaoDaLoja } from '@/components/loja/operacao';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { companyStoreOperationApi } from '@/lib/api-client';
import { FORMAS_DE_PAGAMENTO, GRUPOS_DE_PAGAMENTO, descricaoDaForma } from '@/lib/loja-pagamentos';

/**
 * Receber online é pelo Asaas, direto na conta da loja — e a conta ainda não
 * tem onde ser cadastrada. Até ter, o grupo online fica travado aqui, e o
 * servidor recusa e esconde as formas online.
 */
const RECEBE_ONLINE = false;

function ordenadas(formas: FormaDePagamento[]): string {
  return JSON.stringify([...formas].sort());
}

/**
 * As formas de pagamento, em dois grupos: pagar agora ou pagar na entrega. A
 * mesma lista que o checkout vai mostrar ao cliente.
 */
export function PagamentosDaLoja() {
  const consulta = useOperacaoDaLoja();
  const [versao, setVersao] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formas de pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {consulta.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar as formas.</p>
            <Button type="button" variant="outline" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : !consulta.data ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Formulario
            key={versao}
            salvas={consulta.data.pagamentos}
            onDescartar={() => setVersao((atual) => atual + 1)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Formulario({
  salvas,
  onDescartar,
}: {
  salvas: FormaDePagamento[];
  onDescartar: () => void;
}) {
  const [formas, setFormas] = useState<FormaDePagamento[]>(salvas);
  const gravar = useGravarOperacao(companyStoreOperationApi.updatePayments);

  // Só as formas que valem: online marcada sem conta não chega ao cliente, e
  // contá-la deixaria desmarcar a última forma que ele de fato enxerga.
  const efetivas = formas.filter(
    (forma) => RECEBE_ONLINE || descricaoDaForma(forma).grupo !== 'ONLINE',
  );
  const mudou = ordenadas(efetivas) !== ordenadas(salvas);

  function alternar(forma: FormaDePagamento) {
    setFormas((atual) =>
      atual.includes(forma) ? atual.filter((item) => item !== forma) : [...atual, forma],
    );
  }

  return (
    <>
      {(['ONLINE', 'ENTREGA'] as const).map((grupo) => {
        const doGrupo = FORMAS_DE_PAGAMENTO.filter((forma) => forma.grupo === grupo);
        const bloqueado = grupo === 'ONLINE' && !RECEBE_ONLINE;

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

            {bloqueado && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                Receber online depende da conta Asaas da loja, que ainda não pode ser cadastrada.
                Por enquanto, o cliente paga na entrega.
              </p>
            )}

            {doGrupo.map((forma) => {
              const marcada = formas.includes(forma.valor);
              const ultima = marcada && !bloqueado && efetivas.length === 1;
              return (
                <label
                  key={forma.valor}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${
                    bloqueado ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={marcada && !bloqueado}
                    disabled={bloqueado || ultima}
                    onCheckedChange={() => alternar(forma.valor)}
                    aria-label={forma.titulo}
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
                essas opções precisa saber que a máquina sai com a entrega — e
                tem que voltar. */}
            {grupo === 'ENTREGA' && formas.some((forma) => forma.endsWith('_MAQUININHA')) && (
              <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                As opções na maquininha exigem que a sua máquina vá com o motoboy até o cliente — e
                volte com ele para a loja.
              </p>
            )}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!mudou || efetivas.length === 0 || gravar.isPending}
          onClick={() => gravar.mutate({ pagamentos: efetivas })}
        >
          {gravar.isPending ? 'Salvando...' : 'Salvar formas de pagamento'}
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
      {gravar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {mensagemDoErro(gravar.error, 'Não foi possível salvar as formas de pagamento.')}
        </p>
      )}
    </>
  );
}
