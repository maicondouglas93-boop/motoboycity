import { describe, expect, it } from 'vitest';
import {
  domingoDePascoa,
  feriadosNacionais,
  horariosParaAgendar,
  hora,
  observacaoDaFaixa,
  problemasDoHorario,
  proximaAberturaDoHorario,
  proximosFeriados,
  rotuloDoDia,
  situacaoDaLoja,
  type AjusteManual,
  type DiaDeFuncionamento,
  type ExcecaoDeData,
  type Funcionamento,
} from './loja-horario';

/**
 * `situacaoDaLoja` decide se a página aceita pedido. Errar aqui tem duas
 * consequências opostas e ambas ruins: recusar venda de loja aberta, ou aceitar
 * pedido com a cozinha apagada e chamar motoboy para porta fechada.
 *
 * Os casos abaixo são os que não dá para conferir abrindo o navegador — não se
 * espera até o Natal, nem até as duas da manhã de sábado, para saber se
 * funciona. Toda data leva o fuso (−03:00): a regra é no relógio da loja, e o
 * teste tem que dar o mesmo resultado numa máquina em qualquer fuso.
 */

/** Um instante no relógio da loja: `em('2026-09-22T12:00')`. */
const em = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

const ALMOCO_E_JANTA = [
  { abre: '11:00', fecha: '14:00' },
  { abre: '18:00', fecha: '22:00' },
];

/*
 * 20/09/2026 é domingo. A semana do exemplo:
 * domingo fechado; segunda a quinta almoço e janta; sexta com a janta passando
 * da meia-noite; sábado só à noite, até a meia-noite em ponto.
 */
const SEMANA: DiaDeFuncionamento[] = [
  { dia: 0, faixas: [] },
  { dia: 1, faixas: ALMOCO_E_JANTA },
  { dia: 2, faixas: ALMOCO_E_JANTA },
  { dia: 3, faixas: ALMOCO_E_JANTA },
  { dia: 4, faixas: ALMOCO_E_JANTA },
  {
    dia: 5,
    faixas: [
      { abre: '11:00', fecha: '14:00' },
      { abre: '18:00', fecha: '02:00' },
    ],
  },
  { dia: 6, faixas: [{ abre: '18:00', fecha: '00:00' }] },
];

function funcionamento(mudancas: Partial<Funcionamento> = {}): Funcionamento {
  return { semana: SEMANA, excecoes: [], ajuste: null, mensagemFechada: '', ...mudancas };
}

function excecao(mudancas: Partial<ExcecaoDeData>): ExcecaoDeData {
  return {
    id: 'x',
    inicio: '2026-09-22',
    fim: '2026-09-22',
    tipo: 'FECHADO',
    motivo: '',
    faixas: [],
    ...mudancas,
  };
}

function ajuste(estado: AjusteManual['estado'], desde: string, ate: string | null): AjusteManual {
  return {
    estado,
    desde: em(desde).toISOString(),
    ate: ate === null ? null : em(ate).toISOString(),
  };
}

describe('situacaoDaLoja — horário da semana', () => {
  it('abre dentro da faixa e diz até quando', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-22T12:00'))).toMatchObject({
      aberta: true,
      motivo: 'HORARIO',
      texto: 'Aberto até 14:00',
    });
  });

  it('fecha no intervalo entre almoço e janta, e diz quando volta', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-22T15:30'))).toMatchObject({
      aberta: false,
      texto: 'Fechado · abre às 18:00',
    });
  });

  it('depois da última faixa, aponta para o dia seguinte', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-22T23:00')).texto).toBe(
      'Fechado · abre amanhã às 11:00',
    );
  });

  it('no domingo fechado, procura o próximo dia que abre', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-20T12:00')).texto).toBe(
      'Fechado · abre amanhã às 11:00',
    );
  });

  it('fecha exatamente no minuto de fechar, e não um minuto depois', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-22T13:59')).aberta).toBe(true);
    expect(situacaoDaLoja(funcionamento(), em('2026-09-22T14:00')).aberta).toBe(false);
  });

  it('mais de uma semana adiante, diz a data em vez do nome do dia', () => {
    const soNaSexta = funcionamento({
      semana: SEMANA.map((dia) => (dia.dia === 5 ? dia : { ...dia, faixas: [] })),
      excecoes: [excecao({ inicio: '2026-09-25', fim: '2026-09-25' })],
    });
    expect(situacaoDaLoja(soNaSexta, em('2026-09-24T12:00')).texto).toBe(
      'Fechado · abre em 02/10 às 11:00',
    );
  });

  it('sem nenhum dia com horário, não promete abrir', () => {
    const vazio = funcionamento({ semana: SEMANA.map((dia) => ({ ...dia, faixas: [] })) });
    expect(situacaoDaLoja(vazio, em('2026-09-22T12:00'))).toMatchObject({
      aberta: false,
      texto: 'Fechado',
      muda: null,
    });
  });

  it('loja aberta o tempo todo diz 24 horas, e não uma hora da semana que vem', () => {
    const sempre = funcionamento({
      semana: SEMANA.map((dia) => ({ ...dia, faixas: [{ abre: '00:00', fecha: '00:00' }] })),
    });
    expect(situacaoDaLoja(sempre, em('2026-09-22T03:00'))).toMatchObject({
      aberta: true,
      texto: 'Aberto 24 horas',
      muda: null,
    });
  });
});

describe('situacaoDaLoja — depois da meia-noite', () => {
  it('a sexta que vai até as duas continua aberta de madrugada, já no sábado', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-26T01:30'))).toMatchObject({
      aberta: true,
      texto: 'Aberto até 02:00',
    });
  });

  it('às 23h de sexta já diz que vai até as duas', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-25T23:00')).texto).toBe('Aberto até 02:00');
  });

  it('fecha às duas em ponto e aponta a abertura de sábado', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-26T02:00'))).toMatchObject({
      aberta: false,
      texto: 'Fechado · abre às 18:00',
    });
  });

  it('fechar à meia-noite em ponto não invade o domingo fechado', () => {
    expect(situacaoDaLoja(funcionamento(), em('2026-09-26T23:30')).texto).toBe('Aberto até 00:00');
    expect(situacaoDaLoja(funcionamento(), em('2026-09-27T00:10')).aberta).toBe(false);
  });

  it('faixas que se encostam na meia-noite viram uma noite só', () => {
    const emendada = funcionamento({
      semana: SEMANA.map((dia) =>
        dia.dia === 5
          ? { ...dia, faixas: [{ abre: '18:00', fecha: '00:00' }] }
          : dia.dia === 6
            ? { ...dia, faixas: [{ abre: '00:00', fecha: '02:00' }] }
            : dia,
      ),
    });
    expect(situacaoDaLoja(emendada, em('2026-09-25T23:00')).texto).toBe('Aberto até 02:00');
  });

  it('um feriado no sábado não corta a madrugada que começou na sexta', () => {
    const feriado = funcionamento({
      excecoes: [excecao({ inicio: '2026-09-26', fim: '2026-09-26', motivo: 'Feriado' })],
    });
    expect(situacaoDaLoja(feriado, em('2026-09-26T01:00')).aberta).toBe(true);
    expect(situacaoDaLoja(feriado, em('2026-09-26T19:00')).texto).toBe('Fechado hoje · Feriado');
  });
});

describe('situacaoDaLoja — datas especiais', () => {
  it('o feriado vence o horário e diz o motivo', () => {
    const loja = funcionamento({ excecoes: [excecao({ motivo: 'Reforma' })] });
    const situacao = situacaoDaLoja(loja, em('2026-09-22T12:00'));
    expect(situacao).toMatchObject({
      aberta: false,
      motivo: 'EXCECAO',
      texto: 'Fechado hoje · Reforma',
    });
    expect(situacao.muda).toEqual(em('2026-09-23T11:00'));
  });

  it('o feriado de outro dia não fecha hoje', () => {
    const loja = funcionamento({
      excecoes: [excecao({ inicio: '2026-12-25', fim: '2026-12-25' })],
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T12:00')).aberta).toBe(true);
  });

  it('férias de vários dias dizem até quando, e apontam a volta', () => {
    const loja = funcionamento({
      excecoes: [excecao({ inicio: '2026-09-21', fim: '2026-09-27', motivo: 'Férias coletivas' })],
    });
    const situacao = situacaoDaLoja(loja, em('2026-09-22T12:00'));
    expect(situacao.texto).toBe('Fechado até 27/09 · Férias coletivas');
    expect(situacao.muda).toEqual(em('2026-09-28T11:00'));
  });

  it('o horário especial troca o da semana naquele dia', () => {
    const loja = funcionamento({
      excecoes: [
        excecao({
          tipo: 'HORARIO_ESPECIAL',
          motivo: 'Festa da cidade',
          faixas: [{ abre: '09:00', fecha: '12:00' }],
        }),
      ],
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T10:00'))).toMatchObject({
      aberta: true,
      motivo: 'EXCECAO',
      texto: 'Aberto até 12:00 · Festa da cidade',
    });
    // 13h seria horário de almoço num dia comum — não neste.
    expect(situacaoDaLoja(loja, em('2026-09-22T13:00')).texto).toBe(
      'Fechado · abre amanhã às 11:00',
    );
  });

  it('dentro das férias, a data mais curta vence: a véspera com horário próprio abre', () => {
    const loja = funcionamento({
      excecoes: [
        excecao({ inicio: '2026-09-20', fim: '2026-09-30', motivo: 'Férias' }),
        excecao({
          tipo: 'HORARIO_ESPECIAL',
          motivo: 'Plantão',
          faixas: [{ abre: '10:00', fecha: '15:00' }],
        }),
      ],
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T12:00')).aberta).toBe(true);
    expect(situacaoDaLoja(loja, em('2026-09-23T12:00')).aberta).toBe(false);
  });
});

describe('situacaoDaLoja — o que a loja decide na hora', () => {
  it('a pausa diz quando os pedidos voltam', () => {
    const loja = funcionamento({
      ajuste: ajuste('PAUSADA', '2026-09-22T12:00', '2026-09-22T12:30'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T12:10'))).toMatchObject({
      aberta: false,
      motivo: 'PAUSADA',
      texto: 'Pedidos pausados · voltam às 12:30',
    });
  });

  it('a pausa que passa do fechamento diz quando a loja abre de novo', () => {
    const loja = funcionamento({
      ajuste: ajuste('PAUSADA', '2026-09-22T13:30', '2026-09-22T14:30'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T13:50')).texto).toBe(
      'Pedidos pausados · abre às 18:00',
    );
  });

  it('a pausa sem fim não promete volta', () => {
    const loja = funcionamento({ ajuste: ajuste('PAUSADA', '2026-09-22T12:00', null) });
    expect(situacaoDaLoja(loja, em('2026-09-22T12:10'))).toMatchObject({
      texto: 'Pedidos pausados',
      muda: null,
    });
  });

  it('a pausa vencida some sozinha, sem ninguém precisar desfazer', () => {
    const loja = funcionamento({
      ajuste: ajuste('PAUSADA', '2026-09-22T11:30', '2026-09-22T12:00'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T12:10'))).toMatchObject({
      aberta: true,
      motivo: 'HORARIO',
    });
  });

  it('fechar até a próxima abertura volta sozinho no dia seguinte', () => {
    const loja = funcionamento({
      ajuste: ajuste('FECHADA', '2026-09-22T19:00', '2026-09-23T11:00'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T19:10'))).toMatchObject({
      aberta: false,
      motivo: 'FECHADA_MANUAL',
      texto: 'Fechado agora · abre amanhã às 11:00',
    });
    expect(situacaoDaLoja(loja, em('2026-09-23T11:00')).aberta).toBe(true);
  });

  it('fechar até reabrir não promete abertura nenhuma', () => {
    const loja = funcionamento({ ajuste: ajuste('FECHADA', '2026-09-22T19:00', null) });
    expect(situacaoDaLoja(loja, em('2026-09-24T12:00')).texto).toBe('Fechado no momento');
  });

  it('abrir fora do horário vale até a hora combinada', () => {
    const loja = funcionamento({
      ajuste: ajuste('ABERTA', '2026-09-22T22:00', '2026-09-22T23:30'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T22:30'))).toMatchObject({
      aberta: true,
      motivo: 'ABERTA_MANUAL',
      texto: 'Aberto até 23:30',
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T23:30')).aberta).toBe(false);
  });

  it('abrir antes da hora emenda com o horário, e diz o fechamento de verdade', () => {
    const loja = funcionamento({
      ajuste: ajuste('ABERTA', '2026-09-22T17:00', '2026-09-22T18:00'),
    });
    expect(situacaoDaLoja(loja, em('2026-09-22T17:30'))).toMatchObject({
      motivo: 'ABERTA_MANUAL',
      texto: 'Aberto até 22:00',
    });
  });

  it('a próxima abertura do horário pula a faixa em que a loja já está', () => {
    expect(proximaAberturaDoHorario(funcionamento(), em('2026-09-22T12:00'))).toEqual(
      em('2026-09-22T18:00'),
    );
    expect(proximaAberturaDoHorario(funcionamento(), em('2026-09-22T20:00'))).toEqual(
      em('2026-09-23T11:00'),
    );
  });
});

describe('horariosParaAgendar', () => {
  const regras = { antecedenciaMinimaMin: 60, antecedenciaMaximaDias: 1, intervaloMin: 30 };
  // Entrega: 20 de preparo mais 15 de caminho.
  const ANTES = 35;

  const horas = (dia: { horarios: Date[] } | undefined) => dia?.horarios.map(hora) ?? [];

  it('respeita a antecedência mínima e o tempo de a cozinha começar com a loja aberta', () => {
    const dias = horariosParaAgendar(funcionamento(), regras, ANTES, em('2026-09-22T12:00'));
    expect(dias.map((dia) => dia.data)).toEqual(['2026-09-22', '2026-09-23']);
    // 13:00 é a antecedência mínima. 15:00 exigiria começar às 14:25, com o
    // almoço já encerrado; 18:30, às 17:55, antes de a janta abrir.
    expect(horas(dias[0])).toEqual([
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
    ]);
    expect(horas(dias[1])[0]).toBe('12:00');
  });

  it('não passa da antecedência máxima', () => {
    const dias = horariosParaAgendar(
      funcionamento(),
      { ...regras, antecedenciaMaximaDias: 0 },
      ANTES,
      em('2026-09-22T12:00'),
    );
    expect(dias.map((dia) => dia.data)).toEqual(['2026-09-22']);
  });

  it('a pausa também vale para o agendamento', () => {
    const pausada = funcionamento({
      ajuste: ajuste('PAUSADA', '2026-09-22T12:00', '2026-09-22T13:30'),
    });
    const dias = horariosParaAgendar(pausada, regras, ANTES, em('2026-09-22T12:00'));
    expect(horas(dias[0])[0]).toBe('14:30');
  });

  it('fechada até reabrir, não há horário para agendar', () => {
    const fechada = funcionamento({ ajuste: ajuste('FECHADA', '2026-09-22T12:00', null) });
    expect(horariosParaAgendar(fechada, regras, ANTES, em('2026-09-22T12:00'))).toEqual([]);
  });

  it('dia fechado não oferece horário', () => {
    const domingo = horariosParaAgendar(
      funcionamento(),
      { ...regras, antecedenciaMaximaDias: 0 },
      ANTES,
      em('2026-09-20T09:00'),
    );
    expect(domingo).toEqual([]);
  });

  /*
   * A regressão vista na tela: a noite de sábado que passa da meia-noite punha
   * um "domingo" na lista de dias — e a loja não abre no domingo. A madrugada
   * é da noite em que a cozinha abriu.
   */
  it('a madrugada fica na noite em que a cozinha abriu, e não vira um dia a mais', () => {
    const dias = horariosParaAgendar(funcionamento(), regras, ANTES, em('2026-09-25T12:00'));
    expect(dias.map((dia) => dia.data)).toEqual(['2026-09-25', '2026-09-26']);
    // Sexta vai até as 02:00: a última janela começa às 02:30, com a cozinha
    // começando às 01:55 — ainda dentro da noite de sexta.
    expect(horas(dias[0]).slice(-3)).toEqual(['01:30', '02:00', '02:30']);
    expect(dias[0]?.horarios.at(-1)).toEqual(em('2026-09-26T02:30'));
  });
});

describe('feriados nacionais', () => {
  it('calcula a Páscoa, e por ela o Carnaval, a Sexta-feira Santa e Corpus Christi', () => {
    expect(domingoDePascoa(2026)).toBe('2026-04-05');
    expect(domingoDePascoa(2027)).toBe('2027-03-28');
    const datas = feriadosNacionais(2026).map((feriado) => feriado.data);
    expect(datas).toContain('2026-02-16');
    expect(datas).toContain('2026-02-17');
    expect(datas).toContain('2026-04-03');
    expect(datas).toContain('2026-06-04');
    expect(datas).toContain('2026-11-20');
  });

  it('lista os próximos a partir de hoje, atravessando o ano', () => {
    const lista = proximosFeriados(em('2026-09-24T10:00'));
    expect(lista[0]).toEqual({ data: '2026-10-12', nome: 'Nossa Senhora Aparecida' });
    expect(lista.some((feriado) => feriado.data === '2027-01-01')).toBe(true);
    expect(lista.some((feriado) => feriado.data < '2026-09-24')).toBe(false);
  });
});

describe('problemasDoHorario', () => {
  const hoje = '2026-09-22';

  it('a semana do exemplo não tem problema', () => {
    expect(problemasDoHorario(funcionamento(), hoje)).toEqual([]);
  });

  it('avisa quando duas faixas do mesmo dia se sobrepõem', () => {
    const loja = funcionamento({
      semana: SEMANA.map((dia) =>
        dia.dia === 1
          ? {
              ...dia,
              faixas: [
                { abre: '11:00', fecha: '15:00' },
                { abre: '14:00', fecha: '18:00' },
              ],
            }
          : dia,
      ),
    });
    expect(problemasDoHorario(loja, hoje)).toEqual([
      { texto: 'Na segunda, 11:00–15:00 e 14:00–18:00 se sobrepõem.', grave: false },
    ]);
  });

  it('avisa quando a madrugada entra no horário do dia seguinte', () => {
    const loja = funcionamento({
      semana: SEMANA.map((dia) =>
        dia.dia === 6 ? { ...dia, faixas: [{ abre: '01:00', fecha: '05:00' }] } : dia,
      ),
    });
    expect(problemasDoHorario(loja, hoje)[0]?.texto).toBe(
      'A faixa de sexta que vai até 02:00 entra no horário de sábado, que abre às 01:00.',
    );
  });

  it('horário especial sem horário é grave: a loja fecharia sem querer', () => {
    const loja = funcionamento({
      excecoes: [excecao({ tipo: 'HORARIO_ESPECIAL', motivo: 'Véspera', faixas: [] })],
    });
    expect(problemasDoHorario(loja, hoje)).toContainEqual({
      texto:
        '"Véspera" está como horário especial, mas sem horário. Para não abrir, use "Fechado".',
      grave: true,
    });
  });

  it('data que termina antes de começar é grave', () => {
    const loja = funcionamento({
      excecoes: [excecao({ inicio: '2026-10-10', fim: '2026-10-05', motivo: 'Férias' })],
    });
    expect(problemasDoHorario(loja, hoje)).toContainEqual({
      texto: '"Férias" termina antes de começar.',
      grave: true,
    });
  });

  it('nenhum dia com horário é grave', () => {
    const loja = funcionamento({ semana: SEMANA.map((dia) => ({ ...dia, faixas: [] })) });
    expect(problemasDoHorario(loja, hoje).some((problema) => problema.grave)).toBe(true);
  });
});

describe('o que a tela escreve', () => {
  it('explica a faixa que não é óbvia', () => {
    expect(observacaoDaFaixa({ abre: '18:00', fecha: '02:00' })).toBe(
      'termina às 02:00 do dia seguinte',
    );
    expect(observacaoDaFaixa({ abre: '00:00', fecha: '00:00' })).toBe('24 horas');
    expect(observacaoDaFaixa({ abre: '18:00', fecha: '00:00' })).toBeNull();
    expect(observacaoDaFaixa({ abre: '11:00', fecha: '14:00' })).toBeNull();
  });

  it('chama os dias do jeito que se fala', () => {
    const agora = em('2026-09-22T12:00');
    expect(rotuloDoDia('2026-09-22', agora)).toBe('hoje');
    expect(rotuloDoDia('2026-09-23', agora)).toBe('amanhã');
    expect(rotuloDoDia('2026-09-25', agora)).toBe('sexta');
    expect(rotuloDoDia('2026-10-02', agora)).toBe('02/10');
  });
});
