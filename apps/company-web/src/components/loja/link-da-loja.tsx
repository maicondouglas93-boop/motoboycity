'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoreSettings } from '@motoboycity/types';
import { updateStoreLinkSchema } from '@motoboycity/validation';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyStoreSettingsApi } from '@/lib/api-client';
import { session } from '@/lib/session';

export const CHAVE_DA_CONFIGURACAO = ['company', 'store', 'settings'] as const;

/**
 * O endereço que funciona hoje. O domínio próprio das lojas
 * (`pedidos.motoboycity.com.br`) ainda não existe: mostrar e copiar ele seria
 * dar à loja um link que não abre.
 */
function enderecoDaLoja(slug: string): string {
  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origem}/pedir/${slug}`;
}

/**
 * O link da loja — o que ela manda no WhatsApp, põe no QR da mesa e na bio do
 * Instagram. É o campo mais consequente das Configurações, e o primeiro que
 * grava no sistema.
 */
export function LinkDaLoja() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<{ slug: string; name: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const configuracao = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => companyStoreSettingsApi.settings(token as string),
    enabled: Boolean(token),
  });

  const salvar = useMutation({
    mutationFn: (payload: { slug: string; name: string }) =>
      companyStoreSettingsApi.updateLink(token as string, payload),
    onSuccess: (salva) => {
      queryClient.setQueryData<StoreSettings>(CHAVE_DA_CONFIGURACAO, salva);
      setRascunho(null);
      setErro(null);
      setCopiado(false);
    },
    onError: (falha) => setErro(mensagemDoErro(falha, 'Não foi possível salvar o link.')),
  });

  if (configuracao.isError) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <p className="text-sm text-destructive">Não foi possível carregar o link da loja.</p>
          <Button type="button" variant="outline" onClick={() => void configuracao.refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const salva = configuracao.data;
  const valores = rascunho ?? {
    slug: salva?.slug ?? salva?.suggestedSlug ?? '',
    name: salva?.name ?? '',
  };
  const mudou =
    salva !== undefined &&
    (salva.slug === null || valores.slug !== salva.slug || valores.name !== salva.name);

  function mudar(campo: 'slug' | 'name', valor: string) {
    setRascunho({ ...valores, [campo]: valor });
    setErro(null);
  }

  function gravar() {
    const conferido = updateStoreLinkSchema.safeParse(valores);
    if (!conferido.success) {
      setErro(conferido.error.issues[0]?.message ?? 'Confira o link e o nome.');
      return;
    }
    salvar.mutate(conferido.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link da sua loja</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!salva ? (
          <p className="text-sm text-muted-foreground">Carregando o link...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="nomeDaLoja">Nome da loja</Label>
              <Input
                id="nomeDaLoja"
                value={valores.name}
                maxLength={80}
                onChange={(evento) => mudar('name', evento.target.value)}
                className="max-w-80"
              />
              <p className="text-xs text-muted-foreground">
                É o nome que o cliente vê no alto da página e no app instalado.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Endereço</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">…/pedir/</span>
                <Input
                  id="slug"
                  value={valores.slug}
                  maxLength={40}
                  onChange={(evento) => mudar('slug', evento.target.value.toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="max-w-56"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Letras sem acento, números e hífen. Ex.: acai-do-centro.
              </p>
            </div>

            {erro && (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={gravar} disabled={!mudou || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : salva.slug ? 'Salvar link' : 'Criar o link'}
              </Button>
              {salva.slug && !mudou && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(enderecoDaLoja(salva.slug as string))
                        .then(() => setCopiado(true))
                        .catch(() => setCopiado(false));
                    }}
                  >
                    {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Link
                    href={`/pedir/${salva.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'ghost' })}
                  >
                    <ExternalLink className="size-4" aria-hidden="true" /> Abrir a loja
                  </Link>
                </>
              )}
            </div>

            {salva.slug ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {enderecoDaLoja(salva.slug)} — é este endereço que você manda no WhatsApp, põe no
                  QR da mesa e na bio do Instagram. A página mostra os produtos publicados, e ainda
                  não recebe pedidos.
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sua loja ainda não tem link. O endereço acima é uma sugestão pelo nome da empresa —
                mude se quiser, e salve para a página existir.
              </p>
            )}

            {/* A lição que o código da central já deu: slug sem troca vira
                papel morto quando a loja muda de nome. */}
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              Se você trocar o endereço, o antigo continua funcionando e leva ao novo — seu panfleto
              e seu QR não deixam de valer. E o antigo continua seu: nenhuma outra loja pode
              pegá-lo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
