import { applyDateMask } from '../src/lib/dateMask';

describe('applyDateMask', () => {
  it('insere as barras enquanto o motoboy digita', () => {
    // O caso que motivou a mascara: o teclado numerico nao tem a tecla `/`, e a
    // validacao exige DD/MM/AAAA — sem isto o formato pedido e impossivel de
    // digitar.
    expect(applyDateMask('07011993')).toBe('07/01/1993');
  });

  it('vai formatando parcialmente, sem barra sobrando no fim', () => {
    // Barra antes do proximo digito faria o campo piscar `07/` e parecer erro.
    expect(applyDateMask('0')).toBe('0');
    expect(applyDateMask('07')).toBe('07');
    expect(applyDateMask('070')).toBe('07/0');
    expect(applyDateMask('0701')).toBe('07/01');
    expect(applyDateMask('07011')).toBe('07/01/1');
  });

  it('ignora o que a pessoa digitar que nao for numero', () => {
    expect(applyDateMask('07/01/1993')).toBe('07/01/1993');
    expect(applyDateMask('07-01-1993')).toBe('07/01/1993');
    expect(applyDateMask('a0b7c0d1e1f9g9h3')).toBe('07/01/1993');
  });

  it('para em oito digitos', () => {
    // Colar um texto maior nao pode gerar um ano de cinco digitos.
    expect(applyDateMask('070119931234')).toBe('07/01/1993');
  });

  it('apagar funciona porque a string e remontada dos digitos', () => {
    // Quem apaga a barra apaga o digito antes dela junto, que e o esperado.
    expect(applyDateMask('07/01/199')).toBe('07/01/199');
    expect(applyDateMask('07/01/')).toBe('07/01');
    expect(applyDateMask('07/0')).toBe('07/0');
  });

  it('campo vazio continua vazio', () => {
    expect(applyDateMask('')).toBe('');
    expect(applyDateMask('///')).toBe('');
  });
});
