/**
 * Formata a data enquanto o motoboy digita: `07011993` vira `07/01/1993`.
 *
 * Existe porque o campo abre teclado NUMERICO — que nao tem a tecla `/` — e a
 * validacao exige `DD/MM/AAAA`. Sem a mascara, o formato pedido e impossivel de
 * digitar: a pessoa preenche tudo certo e o formulario recusa sem saida.
 *
 * A mascara trabalha so com os digitos e remonta a string a cada tecla. Isso
 * tambem faz o apagar funcionar: quem apaga a barra apaga o digito anterior
 * junto, que e o comportamento esperado.
 */
export function applyDateMask(value: string): string {
  const digitos = value.replace(/\D/g, '').slice(0, 8);

  if (digitos.length <= 2) {
    return digitos;
  }
  if (digitos.length <= 4) {
    return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  }
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}
