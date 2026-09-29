import {
  crc16,
  gerarPixCopiaECola,
  hasValidCnpjCheckDigits,
  normalizarChavePix,
  whatsappComDdi,
} from '@motoboycity/validation';

/**
 * O código do Pix (BR Code) que o cliente escaneia ou cola no banco. Um byte
 * errado faz o banco recusar o QR — e o cliente, sem gateway nenhum para
 * explicar, desiste de pagar —, então o formato é conferido contra o exemplo
 * oficial do Manual de Padrões para Iniciação do Pix, do Banco Central.
 */

/** O exemplo do manual do Banco Central, sem o CRC final. */
const EXEMPLO_DO_MANUAL =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';

describe('crc16 do Pix', () => {
  it('confere com o exemplo do manual do Banco Central', () => {
    expect(crc16(EXEMPLO_DO_MANUAL)).toBe('1D3D');
  });

  it('sempre com quatro dígitos hexadecimais em maiúsculas', () => {
    expect(crc16('')).toBe('FFFF');
    expect(crc16('a')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('gerarPixCopiaECola', () => {
  const dados = {
    chave: '+5533999887766',
    nomeDoRecebedor: 'Lanches do Zé',
    cidade: 'Lajinha',
    valor: 48.2,
    identificador: 'PEDIDO1650',
  };

  /** Lê o código de volta, campo a campo, como o banco: id, tamanho, valor. */
  function pares(codigo: string): Array<[string, string]> {
    const lidos: Array<[string, string]> = [];
    let posicao = 0;
    while (posicao < codigo.length) {
      const id = codigo.slice(posicao, posicao + 2);
      const tamanho = Number(codigo.slice(posicao + 2, posicao + 4));
      lidos.push([id, codigo.slice(posicao + 4, posicao + 4 + tamanho)]);
      posicao += 4 + tamanho;
    }
    return lidos;
  }
  const ler = (codigo: string): Record<string, string> => Object.fromEntries(pares(codigo));

  it('monta o Pix estático com valor, na ordem e nos tamanhos do padrão', () => {
    const codigo = gerarPixCopiaECola(dados);
    const campos = ler(codigo);

    expect(campos['00']).toBe('01');
    expect(ler(campos['26']!)).toEqual({ '00': 'br.gov.bcb.pix', '01': '+5533999887766' });
    expect(campos['52']).toBe('0000');
    expect(campos['53']).toBe('986');
    expect(campos['54']).toBe('48.20');
    expect(campos['58']).toBe('BR');
    expect(campos['59']).toBe('LANCHES DO ZE');
    expect(campos['60']).toBe('LAJINHA');
    expect(ler(campos['62']!)).toEqual({ '05': 'PEDIDO1650' });
    // Os campos aparecem em ordem crescente, e o CRC é o último.
    expect(pares(codigo).map(([id]) => id)).toEqual([
      '00',
      '26',
      '52',
      '53',
      '54',
      '58',
      '59',
      '60',
      '62',
      '63',
    ]);
  });

  it('o CRC do código é o CRC do que vem antes dele', () => {
    const codigo = gerarPixCopiaECola(dados);

    expect(codigo.slice(-8, -4)).toBe('6304');
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
  });

  it('o valor leva sempre dois decimais, sem separador de milhar', () => {
    expect(ler(gerarPixCopiaECola({ ...dados, valor: 5 }))['54']).toBe('5.00');
    expect(ler(gerarPixCopiaECola({ ...dados, valor: 1234.5 }))['54']).toBe('1234.50');
    expect(ler(gerarPixCopiaECola({ ...dados, valor: 0.1 + 0.2 }))['54']).toBe('0.30');
  });

  it('nome e cidade saem como o banco os lê: sem acento, em maiúsculas, dentro do limite', () => {
    const campos = ler(
      gerarPixCopiaECola({
        ...dados,
        nomeDoRecebedor: 'Pão & Café da Vovó Lanchonete e Sorveteria',
        cidade: 'São João del Rei',
      }),
    );

    expect(campos['59']).toBe('PAO CAFE DA VOVO LANCHONE');
    expect(campos['59']!.length).toBeLessThanOrEqual(25);
    expect(campos['60']).toBe('SAO JOAO DEL RE');
    expect(campos['60']!.length).toBeLessThanOrEqual(15);
  });

  it('o identificador só leva letras e números, até 25; sem nenhum, vale "***"', () => {
    const identificador = (texto: string) =>
      ler(ler(gerarPixCopiaECola({ ...dados, identificador: texto }))['62']!)['05'];

    expect(identificador('Pedido #42/A')).toBe('Pedido42A');
    expect(identificador('P'.repeat(40))).toBe('P'.repeat(25));
    expect(identificador('###')).toBe('***');
  });

  it('o código todo é ASCII: um caractere fora dele faria o banco recusar o QR', () => {
    const codigo = gerarPixCopiaECola({
      ...dados,
      nomeDoRecebedor: 'Zé da Açaí ✓',
      cidade: 'Três Corações',
    });

    expect(codigo).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe('normalizarChavePix', () => {
  it('CPF e CNPJ: só dígitos, e só se os dois dígitos de conferência batem', () => {
    expect(normalizarChavePix('CPF_CNPJ', '529.982.247-25')).toBe('52998224725');
    expect(normalizarChavePix('CPF_CNPJ', '529.982.247-26')).toBeNull();
    expect(normalizarChavePix('CPF_CNPJ', '111.111.111-11')).toBeNull();
    expect(normalizarChavePix('CPF_CNPJ', '11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarChavePix('CPF_CNPJ', '11.222.333/0001-82')).toBeNull();
    expect(normalizarChavePix('CPF_CNPJ', '12345')).toBeNull();
  });

  it('celular: DDD e número, com ou sem o 55, sempre escrito com +55', () => {
    expect(normalizarChavePix('CELULAR', '(33) 99988-7766')).toBe('+5533999887766');
    expect(normalizarChavePix('CELULAR', '+55 33 99988-7766')).toBe('+5533999887766');
    expect(normalizarChavePix('CELULAR', '5533999887766')).toBe('+5533999887766');
    expect(normalizarChavePix('CELULAR', '(33) 3221-0000')).toBe('+553332210000');
    expect(normalizarChavePix('CELULAR', '99988-7766')).toBeNull();
  });

  it('e-mail e chave aleatória: em minúsculas, e só se têm o formato', () => {
    expect(normalizarChavePix('EMAIL', ' Loja@Exemplo.COM ')).toBe('loja@exemplo.com');
    expect(normalizarChavePix('EMAIL', 'loja@exemplo')).toBeNull();
    expect(normalizarChavePix('ALEATORIA', '123E4567-E12B-12D1-A456-426655440000')).toBe(
      '123e4567-e12b-12d1-a456-426655440000',
    );
    expect(normalizarChavePix('ALEATORIA', '123e4567')).toBeNull();
    expect(normalizarChavePix('EMAIL', '')).toBeNull();
  });
});

describe('outros ajudantes do Pix direto', () => {
  it('o CNPJ é conferido pelos dois dígitos', () => {
    expect(hasValidCnpjCheckDigits('11222333000181')).toBe(true);
    expect(hasValidCnpjCheckDigits('11222333000180')).toBe(false);
    expect(hasValidCnpjCheckDigits('00000000000000')).toBe(false);
  });

  it('o WhatsApp vai para o link com o DDI do Brasil, sem duplicá-lo', () => {
    expect(whatsappComDdi('33999887766')).toBe('5533999887766');
    expect(whatsappComDdi('5533999887766')).toBe('5533999887766');
    expect(whatsappComDdi('(33) 99988-7766')).toBe('5533999887766');
  });
});
