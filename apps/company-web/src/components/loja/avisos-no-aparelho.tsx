'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { companyStoreOrdersApi } from '@/lib/api-client';
import { inscreverAparelho, situacaoNoRegistro, type SituacaoDoPush } from '@/lib/avisos-push';
import { session } from '@/lib/session';

/** O worker só de avisos do painel, restrito a /loja/ (`public/loja/avisos-sw.js`). */
const WORKER = '/loja/avisos-sw.js';
const ESCOPO = '/loja/';

const TEXTO: Record<SituacaoDoPush, string> = {
  carregando: 'Conferindo este aparelho...',
  'sem-suporte':
    'Este navegador não recebe avisos com a página fechada. No iPhone, só o painel instalado na tela de início recebe.',
  'desligado-no-servidor':
    'Os avisos com o painel fechado ainda não foram ligados no servidor. Até lá, deixe o painel aberto em alguma aba.',
  bloqueado:
    'As notificações estão bloqueadas neste navegador. Libere nas permissões do site — o cadeado ao lado do endereço.',
  desligado: 'Este aparelho só avisa com o painel aberto.',
  ligado: 'Este aparelho avisa mesmo com o painel fechado.',
};

/**
 * Os avisos da loja com o painel fechado, neste aparelho: pedido novo, agendado
 * e cancelado, pelo Web Push, conforme as chaves de "Notificação" acima. Cada
 * aparelho se liga à parte — o celular do dono e o computador do balcão.
 */
export function AvisosNoAparelho() {
  const [situacao, setSituacao] = useState<SituacaoDoPush>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const registro =
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration(ESCOPO)
          : undefined;
      const atual = await situacaoNoRegistro(registro);
      if (ativo) setSituacao(atual);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function ligar() {
    setOcupado(true);
    setErro(null);
    try {
      const registro = await navigator.serviceWorker.register(WORKER, { scope: ESCOPO });
      const inscricao = await inscreverAparelho(registro);
      if (!inscricao) {
        setSituacao(Notification.permission === 'denied' ? 'bloqueado' : 'desligado');
        return;
      }
      await companyStoreOrdersApi.inscreverAvisos(session.getToken() as string, inscricao);
      setSituacao('ligado');
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível ligar os avisos neste aparelho.'));
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration(ESCOPO);
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await companyStoreOrdersApi.cancelarAvisos(
          session.getToken() as string,
          inscricao.endpoint,
        );
        await inscricao.unsubscribe();
      }
      setSituacao('desligado');
    } catch (falha) {
      setErro(mensagemDoErro(falha, 'Não foi possível desligar os avisos neste aparelho.'));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-5 text-muted-foreground" aria-hidden="true" /> Avisos com o
          painel fechado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p role="status" className="text-muted-foreground">
          {TEXTO[situacao]}
        </p>
        {situacao === 'desligado' && (
          <Button type="button" size="sm" disabled={ocupado} onClick={ligar}>
            <BellRing className="size-4" /> Avisar neste aparelho
          </Button>
        )}
        {situacao === 'ligado' && (
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={desligar}>
            Parar de avisar neste aparelho
          </Button>
        )}
        {erro && (
          <p className="text-xs text-destructive" role="alert">
            {erro}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Vale para pedido novo, agendado e cancelado, conforme a coluna &quot;Notificação&quot;
          acima. O som só toca com o painel aberto.
        </p>
      </CardContent>
    </Card>
  );
}
