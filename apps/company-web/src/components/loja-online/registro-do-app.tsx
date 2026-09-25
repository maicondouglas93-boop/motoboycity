'use client';

import { useEffect } from 'react';
import { escutarInstalacao } from './instalacao';

/**
 * Registra o service worker da loja, com escopo restrito a ela, e passa a ouvir
 * o "pode instalar" do navegador.
 *
 * A escuta vem ANTES do registro: é o worker ativo que torna a página
 * instalável, e o navegador pode avisar logo em seguida. Ouvindo depois, o aviso
 * se perderia até o próximo carregamento.
 *
 * O worker só em produção. Em desenvolvimento, um worker que guarda arquivos
 * serviria a versão anterior do código depois de cada edição — e o sintoma,
 * "minha mudança não apareceu", faz qualquer um procurar o erro no lugar errado.
 *
 * O escopo é passado explicitamente. Sem ele, o navegador usaria o diretório do
 * arquivo, que é a raiz do site — e aí o worker da loja passaria a controlar o
 * painel das empresas. O próprio worker se desregistra nesse caso, mas a
 * primeira defesa é nunca registrá-lo assim.
 */
export function RegistroDoApp({ slug }: { slug: string }) {
  useEffect(() => {
    escutarInstalacao();

    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/loja-sw.js', { scope: `/pedir/${slug}` }).catch(() => {
      // Sem service worker a loja funciona igual, só não abre sem internet.
      // Não há o que mostrar ao cliente por isso.
    });
  }, [slug]);

  return null;
}
