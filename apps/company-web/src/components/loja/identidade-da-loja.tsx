'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoreSettings, StoreTheme } from '@motoboycity/types';
import { AlertCircle, ImagePlus, Trash2 } from 'lucide-react';
import { mensagemDoErro } from '@/components/loja/catalogo';
import { CHAVE_DA_CONFIGURACAO } from '@/components/loja/link-da-loja';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { companyStoreSettingsApi } from '@/lib/api-client';
import { fundoDoTema, problemasDasCores, textoSobre } from '@/lib/contraste';
import { session } from '@/lib/session';

const TEMAS: Array<{ valor: StoreTheme; texto: string }> = [
  { valor: 'CLARO', texto: 'Claro' },
  { valor: 'ESCURO', texto: 'Escuro' },
];

/** O mesmo que a API aceita: ela confere de novo, pelos bytes. */
const TIPOS_DA_LOGO = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANHO_MAXIMO_DA_LOGO = 5 * 1024 * 1024;

interface Cores {
  theme: StoreTheme;
  brandColor: string;
  actionColor: string;
}

function corValida(cor: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(cor.trim());
}

/**
 * A logo, o tema e as duas cores da página da loja.
 *
 * A régua de contraste é a mesma do servidor (`problemasDasCores`): cor que
 * some contra o fundo aparece aqui em vermelho e não salva — e, se chegasse lá,
 * seria recusada com a mesma frase.
 */
export function IdentidadeDaLoja() {
  const token = session.getToken();
  const [versao, setVersao] = useState(0);
  const configuracao = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => companyStoreSettingsApi.settings(token as string),
    enabled: Boolean(token),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identidade visual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* O erro da consulta já aparece no cartão do link, que usa a mesma. */}
        {!configuracao.data ? (
          <p className="text-sm text-muted-foreground">
            {configuracao.isError ? 'A aparência depende do link, acima.' : 'Carregando...'}
          </p>
        ) : (
          <Formulario
            key={versao}
            salva={configuracao.data}
            onDescartar={() => setVersao((atual) => atual + 1)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Formulario({ salva, onDescartar }: { salva: StoreSettings; onDescartar: () => void }) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [cores, setCores] = useState<Cores>(() => ({
    theme: salva.identity.theme,
    brandColor: salva.identity.brandColor,
    actionColor: salva.identity.actionColor,
  }));
  const [erroDaLogo, setErroDaLogo] = useState<string | null>(null);

  const guardar = (nova: StoreSettings) =>
    queryClient.setQueryData<StoreSettings>(CHAVE_DA_CONFIGURACAO, nova);
  const salvar = useMutation({
    mutationFn: (payload: Cores) =>
      companyStoreSettingsApi.updateIdentity(token as string, payload),
    onSuccess: guardar,
  });
  const enviarLogo = useMutation({
    mutationFn: (logo: File) => companyStoreSettingsApi.uploadLogo(token as string, logo),
    onSuccess: (nova) => {
      guardar(nova);
      setErroDaLogo(null);
    },
    onError: (falha) => setErroDaLogo(mensagemDoErro(falha, 'Não foi possível enviar a logo.')),
  });
  const tirarLogo = useMutation({
    mutationFn: () => companyStoreSettingsApi.removeLogo(token as string),
    onSuccess: (nova) => {
      guardar(nova);
      setErroDaLogo(null);
    },
    onError: (falha) => setErroDaLogo(mensagemDoErro(falha, 'Não foi possível tirar a logo.')),
  });

  // Sem link, não há página para vestir: o servidor recusaria.
  const semLoja = salva.slug === null;
  const formato = [
    ...(corValida(cores.brandColor) ? [] : ['A cor da marca precisa estar no formato #1a2b3c.']),
    ...(corValida(cores.actionColor) ? [] : ['A cor de ação precisa estar no formato #1a2b3c.']),
  ];
  // A régua só mede cor escrita direito; a escrita errada já está na lista acima.
  const problemas = formato.length === 0 ? problemasDasCores(cores) : [];
  const mudou =
    cores.theme !== salva.identity.theme ||
    cores.brandColor.trim().toLowerCase() !== salva.identity.brandColor ||
    cores.actionColor.trim().toLowerCase() !== salva.identity.actionColor;
  const logo = salva.identity.logoUrl;

  function mudar(mudanca: Partial<Cores>) {
    setCores((atual) => ({ ...atual, ...mudanca }));
  }

  function escolherLogo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    // Limpa a escolha: escolher de novo o mesmo arquivo tem de disparar outra vez.
    evento.target.value = '';
    if (!arquivo) return;
    if (!TIPOS_DA_LOGO.includes(arquivo.type)) {
      setErroDaLogo('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_DA_LOGO) {
      setErroDaLogo('A imagem passa de 5 MB. Use uma menor.');
      return;
    }
    enviarLogo.mutate(arquivo);
  }

  const corDaPrevia = corValida(cores.brandColor) ? cores.brandColor : '#000000';
  const acaoDaPrevia = corValida(cores.actionColor) ? cores.actionColor : '#000000';

  return (
    <>
      {semLoja && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          Crie o link da loja, acima, para salvar a aparência: é por ele que a página existe.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="logo">Logo</Label>
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo da loja" className="size-14 rounded-xl border object-cover" />
          ) : (
            <span
              className="flex size-14 items-center justify-center rounded-xl border border-dashed text-muted-foreground"
              aria-hidden="true"
            >
              <ImagePlus className="size-5" />
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={semLoja || enviarLogo.isPending || tirarLogo.isPending}
              onClick={() => entrada.current?.click()}
            >
              {enviarLogo.isPending ? 'Enviando...' : logo ? 'Trocar logo' : 'Enviar logo'}
            </Button>
            {logo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={enviarLogo.isPending || tirarLogo.isPending}
                onClick={() => tirarLogo.mutate()}
              >
                <Trash2 className="size-4" /> Remover
              </Button>
            )}
          </div>
        </div>
        <input
          ref={entrada}
          id="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={escolherLogo}
        />
        <p className="text-xs text-muted-foreground">
          JPG, PNG ou WebP, até 5 MB. Quadrada fica melhor: ela aparece num quadrado ao lado do
          nome. A logo pesa mais que as cores — com ela, a página já parece a sua loja.
        </p>
        {erroDaLogo && (
          <p className="text-xs text-destructive" role="alert">
            {erroDaLogo}
          </p>
        )}
      </div>

      {/* Vem antes das cores de propósito: o tema define o fundo, e é contra
          esse fundo que as duas cores abaixo são medidas. Trocar o tema depois
          muda quem passa e quem reprova. */}
      <div className="space-y-2">
        <p className="text-sm font-medium" id="rotuloTema">
          Tema da página
        </p>
        <div role="radiogroup" aria-labelledby="rotuloTema" className="flex gap-2">
          {TEMAS.map((item) => (
            <label
              key={item.valor}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                cores.theme === item.valor
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                name="tema"
                value={item.valor}
                checked={cores.theme === item.valor}
                onChange={() => mudar({ theme: item.valor })}
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
              value={corDaPrevia}
              onChange={(evento) => mudar({ brandColor: evento.target.value })}
              className="h-10 w-14 cursor-pointer rounded border"
            />
            <Input
              value={cores.brandColor}
              onChange={(evento) => mudar({ brandColor: evento.target.value })}
              maxLength={7}
              aria-label="Cor da marca em hexadecimal"
            />
          </div>
          <p className="text-xs text-muted-foreground">Faixa do topo, preço em destaque.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="corAcao">Cor de ação</Label>
          <div className="flex items-center gap-2">
            <input
              id="corAcao"
              type="color"
              value={acaoDaPrevia}
              onChange={(evento) => mudar({ actionColor: evento.target.value })}
              className="h-10 w-14 cursor-pointer rounded border"
            />
            <Input
              value={cores.actionColor}
              onChange={(evento) => mudar({ actionColor: evento.target.value })}
              maxLength={7}
              aria-label="Cor de ação em hexadecimal"
            />
          </div>
          <p className="text-xs text-muted-foreground">Botão de adicionar e de finalizar.</p>
        </div>
      </div>

      {/* Escolher cor num formulário às cegas dá resultado ruim quase sempre.
          A prévia não é enfeite: é o que mostra o estrago antes de o cliente
          ver. */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Prévia</p>
        <div className="overflow-hidden rounded-xl border">
          <div
            className="flex items-center gap-2 px-4 py-3 text-sm font-semibold"
            style={{ backgroundColor: corDaPrevia, color: textoSobre(corDaPrevia) }}
          >
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-6 rounded object-cover" />
            )}
            {salva.name}
          </div>
          <div
            className="flex items-center justify-between gap-3 p-4"
            style={{
              backgroundColor: fundoDoTema(cores.theme),
              color: textoSobre(fundoDoTema(cores.theme)),
            }}
          >
            <div>
              <p className="text-sm font-medium">Açaí 500ml</p>
              <p className="text-sm font-semibold" style={{ color: corDaPrevia }}>
                R$ 18,00
              </p>
            </div>
            <span
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: acaoDaPrevia, color: textoSobre(acaoDaPrevia) }}
            >
              Adicionar
            </span>
          </div>
        </div>
      </div>

      {[...formato, ...problemas.map((problema) => problema.mensagem)].map((texto) => (
        <p
          key={texto}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>{texto}</span>
        </p>
      ))}

      {/* A confusão provável é achar que estas cores mexem no painel. Elas não o
          tocam: valem na loja que o cliente abre. */}
      <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        Estas cores valem na página da sua loja, e não neste painel. Quando o cliente instalar a
        loja no celular, a cor da marca também vira a cor da barra do navegador e da tela de
        abertura.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={
            semLoja || !mudou || formato.length > 0 || problemas.length > 0 || salvar.isPending
          }
          onClick={() => salvar.mutate(cores)}
        >
          {salvar.isPending ? 'Salvando...' : 'Salvar aparência'}
        </Button>
        {mudou && (
          <Button type="button" variant="ghost" onClick={onDescartar}>
            Descartar alterações
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {formato.length > 0 || problemas.length > 0
            ? 'Resolva o que está em vermelho para salvar.'
            : mudou
              ? 'Há alterações não salvas.'
              : 'Tudo salvo.'}
        </span>
      </div>
      {salvar.isError && (
        <p className="text-sm text-destructive" role="alert">
          {mensagemDoErro(salvar.error, 'Não foi possível salvar a aparência.')}
        </p>
      )}
    </>
  );
}
