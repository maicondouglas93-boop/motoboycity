import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AvisosDoCliente } from '@/components/loja-online/avisos-do-cliente';
import { RegistroDoApp } from '@/components/loja-online/registro-do-app';
import { LOJA_DE_EXEMPLO } from '@/lib/loja-mock';
import { identidadeDoLink } from '@/lib/loja-publica';

/**
 * O que faz a página da loja ser um app instalável, e não só um site.
 *
 * Também conserta o título da aba: a loja do cliente herdava o do layout raiz,
 * "MOTOboyCity — Empresa", que é o nome do painel da central — o cliente via o
 * nome do sistema de entregas onde deveria ver o da loja.
 *
 * O nome e a cor vêm da loja do link. Se a API não responder, o título e a
 * cor ficam genéricos em vez de derrubar a página: quem diz ao cliente que a
 * loja não abriu é a própria página, com a saída "Tentar de novo".
 */

type Parametros = { params: Promise<{ slug: string }> };

/** A identidade, ou `undefined` se a API não respondeu — `null` é link sem loja. */
async function identidadeOuNada(slug: string) {
  try {
    return await identidadeDoLink(slug);
  } catch {
    return undefined;
  }
}

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { slug } = await params;
  const loja = await identidadeOuNada(slug);
  if (loja === undefined) return { title: 'Loja' };
  if (!loja) return { title: 'Loja não encontrada' };
  const base = `/pedir/${slug}`;

  return {
    title: loja.nome,
    description: `Peça na ${loja.nome}.`,
    manifest: `${base}/manifest.webmanifest`,
    // O iPhone ignora o manifest para ícone e nome na tela inicial: precisa
    // destas marcas à parte.
    appleWebApp: { capable: true, title: loja.nome, statusBarStyle: 'default' },
    icons: {
      icon: `${base}/icone/192`,
      apple: `${base}/icone/180`,
    },
  };
}

/** A barra do navegador na cor da marca — no Android, mesmo sem instalar. */
export async function generateViewport({ params }: Parametros): Promise<Viewport> {
  const { slug } = await params;
  const loja = await identidadeOuNada(slug);
  return { themeColor: loja?.corDaMarca ?? LOJA_DE_EXEMPLO.corDaMarca };
}

export default async function LojaDoSlugLayout({
  children,
  params,
}: Parametros & { children: ReactNode }) {
  const { slug } = await params;
  return (
    <>
      {children}
      <RegistroDoApp slug={slug} />
      <AvisosDoCliente slug={slug} />
    </>
  );
}
