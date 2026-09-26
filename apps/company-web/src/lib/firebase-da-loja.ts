'use client';

import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { CONFIGURACAO_DO_FIREBASE } from '@/lib/conta-da-loja';

/**
 * O login do cliente da loja, pelo Firebase, só com Google.
 *
 * Um app do Firebase com nome próprio: o painel não usa Firebase no navegador,
 * e dar nome evita trombar com qualquer outro que um dia apareça na página.
 */

const NOME_DO_APP = 'loja-online';

let auth: Auth | null = null;

export function authDaLoja(): Auth {
  if (!auth) {
    const app =
      getApps().find((item) => item.name === NOME_DO_APP) ??
      initializeApp(CONFIGURACAO_DO_FIREBASE, NOME_DO_APP);
    auth = getAuth(app);
    // A tela de escolher a conta do Google em português.
    auth.languageCode = 'pt-BR';
  }
  return auth;
}

export function aoMudarOCliente(ouvinte: (usuario: User | null) => void): () => void {
  return onAuthStateChanged(authDaLoja(), ouvinte);
}

export type ResultadoDoLogin = 'ENTROU' | 'DESISTIU' | 'REDIRECIONANDO' | 'FALHOU';

/**
 * Abre a escolha da conta Google numa janela. Se o navegador bloquear a janela,
 * vai pela página inteira e volta — o cliente entra do mesmo jeito.
 */
export async function entrarComGoogle(): Promise<ResultadoDoLogin> {
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(authDaLoja(), provedor);
    return 'ENTROU';
  } catch (erro) {
    const codigo = (erro as { code?: string }).code ?? '';
    if (codigo === 'auth/popup-closed-by-user' || codigo === 'auth/cancelled-popup-request') {
      return 'DESISTIU';
    }
    if (codigo === 'auth/popup-blocked') {
      await signInWithRedirect(authDaLoja(), provedor);
      return 'REDIRECIONANDO';
    }
    return 'FALHOU';
  }
}

export async function sair(): Promise<void> {
  await signOut(authDaLoja());
}

/** O token que a API confere, ou `null` sem ninguém logado. O Firebase o renova sozinho. */
export async function tokenDoCliente(): Promise<string | null> {
  const usuario = authDaLoja().currentUser;
  return usuario ? usuario.getIdToken() : null;
}
