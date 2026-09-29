'use client';

import { useState } from 'react';
import type { FormaDePagamento, PixDiretoDaLoja } from '@motoboycity/types';
import { pixDiretoSchema } from '@motoboycity/validation';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { recebePix, useContaAsaas } from '@/components/loja/conta-asaas';
import { useGravarOperacao, useOperacaoDaLoja } from '@/components/loja/operacao';
import {
  PixDiretoDaLojaCampos,
  rascunhoDoPix,
  type CampoDoPix,
  type RascunhoDoPix,
} from '@/components/loja/pix-direto-da-loja';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { companyStoreOperationApi } from '@/lib/api-client';
import { FORMAS_DE_PAGAMENTO, GRUPOS_DE_PAGAMENTO, descricaoDaForma } from '@/lib/loja-pagamentos';

/**
 * Receber online é pelo Asaas, direto na conta da loja: o Pix, com a conta
 * ligada e com chave Pix ativa. Cartão online fica para depois. O Pix direto,
 * na chave da própria loja, não precisa de conta nenhuma — só dos dados dele,
 * conferidos ao salvar. O servidor confere o mesmo, e esconde da página o que
 * não vale.
 */
function disponivel(forma: FormaDePagamento, pix: boolean): boolean {
  if (forma === 'PIX_DIRETO') return true;
  if (descricaoDaForma(forma).grupo !== 'ONLINE') return true;
  return forma === 'PIX_ONLINE' && pix;
}

/** É um Pix ou o outro: marcar um desmarca o outro. */
const OUTRO_PIX: Partial<Record<FormaDePagamento, FormaDePagamento>> = {
  PIX_ONLINE: 'PIX_DIRETO',
  PIX_DIRETO: 'PIX_ONLINE',
};

/** O primeiro campo com erro, na ordem em que aparecem na tela. */
const ORDEM_DOS_CAMPOS_DO_PIX: CampoDoPix[] = ['chave', 'nomeDoRecebedor', 'cidade', 'whatsapp'];

function ordenadas(formas: FormaDePagamento[]): string {
  return JSON.stringify([...formas].sort());
}

/**
 * As formas de pagamento, em dois grupos: pagar agora ou pagar na entrega. A
 * mesma lista que o checkout vai mostrar ao cliente.
 */
export function PagamentosDaLoja() {
  const consulta = useOperacaoDaLoja();
  const pix = recebePix(useContaAsaas().data);
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
            key={`${versao}-${pix}`}
            pix={pix}
            salvas={consulta.data.pagamentos}
            pixSalvo={consulta.data.pixDireto}
            onDescartar={() => setVersao((atual) => atual + 1)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Formulario({
  pix,
  salvas,
  pixSalvo,
  onDescartar,
}: {
  pix: boolean;
  salvas: FormaDePagamento[];
  pixSalvo: PixDiretoDaLoja | null;
  onDescartar: () => void;
}) {
  const [formas, setFormas] = useState<FormaDePagamento[]>(salvas);
  const [inicial] = useState<RascunhoDoPix>(() => rascunhoDoPix(pixSalvo));
  const [rascunho, setRascunho] = useState<RascunhoDoPix>(inicial);
  const [tentou, setTentou] = useState(false);
  const gravar = useGravarOperacao(companyStoreOperationApi.updatePayments);

  // Só as formas que valem: online marcada sem conta não chega ao cliente, e
  // contá-la deixaria desmarcar a última forma que ele de fato enxerga.
  const efetivas = formas.filter((forma) => disponivel(forma, pix));
  const direto = efetivas.includes('PIX_DIRETO');
  const mudouPix = direto && JSON.stringify(rascunho) !== JSON.stringify(inicial);
  const mudou =
    ordenadas(efetivas) !== ordenadas(salvas.filter((forma) => disponivel(forma, pix))) || mudouPix;

  // O que falta nos dados do Pix, campo por campo — só mostrado depois de tentar
  // salvar, para o formulário não nascer coberto de erro.
  const conferido = direto ? pixDiretoSchema.safeParse(rascunho) : null;
  const errosDoPix: Partial<Record<CampoDoPix, string>> = {};
  if (tentou && conferido && !conferido.success) {
    for (const problema of conferido.error.issues) {
      const campo = problema.path[0] as CampoDoPix | undefined;
      if (campo && !errosDoPix[campo]) errosDoPix[campo] = problema.message;
    }
  }

  function alternar(forma: FormaDePagamento) {
    setFormas((atual) => {
      if (atual.includes(forma)) return atual.filter((item) => item !== forma);
      // Um Pix ou o outro: marcar um desmarca o outro.
      const outro = OUTRO_PIX[forma];
      return [...atual.filter((item) => item !== outro), forma];
    });
  }

  function salvar() {
    if (conferido && !conferido.success) {
      setTentou(true);
      const primeiro = ORDEM_DOS_CAMPOS_DO_PIX.find((campo) =>
        conferido.error.issues.some((problema) => problema.path[0] === campo),
      );
      const elemento = primeiro ? document.getElementById(`pix-${primeiro}`) : null;
      elemento?.scrollIntoView?.({ block: 'center' });
      elemento?.focus({ preventScroll: true });
      return;
    }
    gravar.mutate({
      pagamentos: efetivas,
      // Sem o Pix direto marcado, a chave que já estava gravada fica como está.
      ...(conferido?.success ? { pixDireto: conferido.data } : {}),
    });
  }

  return (
    <>
      {(['ONLINE', 'ENTREGA'] as const).map((grupo) => {
        const doGrupo = FORMAS_DE_PAGAMENTO.filter((forma) => forma.grupo === grupo);
        const semConta = grupo === 'ONLINE' && !pix;

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

            {semConta && (
              <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs">
                O Pix pelo Asaas depende da sua conta Asaas, ligada em &quot;Recebimento online pelo
                Asaas&quot;, abaixo — e com chave Pix ativa. O Pix direto não precisa dela. Cartão
                online ainda não está disponível.
              </p>
            )}
            {grupo === 'ONLINE' && (
              <p className="text-xs text-muted-foreground">
                É um Pix ou o outro: marcar um desmarca o outro.
              </p>
            )}

            {doGrupo.map((forma) => {
              const bloqueado = !disponivel(forma.valor, pix);
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
                  <span className="min-w-0 flex-1">
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

            {grupo === 'ONLINE' && direto && (
              <PixDiretoDaLojaCampos
                valor={rascunho}
                aoMudar={(campo, texto) => setRascunho((atual) => ({ ...atual, [campo]: texto }))}
                erros={errosDoPix}
              />
            )}

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
          onClick={salvar}
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
