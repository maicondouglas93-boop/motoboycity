import { redirect } from 'next/navigation';

/**
 * A lista de faturas virou aba dentro de `/financeiro`.
 *
 * O endereco antigo continua existindo porque ele esta em link salvo e em
 * conversa. Quebrar um endereco que funcionava e cobrar do usuario a mudanca
 * que foi nossa.
 *
 * `/faturas/[id]` NAO se move: e o endereco de uma fatura especifica.
 */
export default function FaturasRedirect() {
  redirect('/financeiro?aba=faturas');
}
