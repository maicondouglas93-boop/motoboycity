/**
 * Quando a loja atende: o horário da semana, as datas que fogem dele e o ajuste
 * que a loja faz na hora — pausar, fechar antes ou abrir fora do horário.
 *
 * Regras puras, sem tela e sem armazenamento. Ficam FORA do `loja-mock.ts` de
 * propósito: aquele arquivo é apagado na integração, e estas regras são as que
 * o servidor vai precisar do mesmo jeito para recusar pedido de loja fechada.
 *
 * Toda conta é feita no FUSO DA LOJA, e não no do aparelho. Um cliente com o
 * celular em outro fuso — ou com o fuso errado — veria a loja abrir na hora
 * dele, e não na da cozinha. É a mesma regra do resto do sistema: a operação é
 * avaliada em horário de Brasília (ver `operation-clock.ts`). Quando houver
 * loja fora desse fuso, ele passa a vir do cadastro dela.
 */

export const FUSO_DA_LOJA = 'America/Sao_Paulo';

/** `HH:MM`, em 24h. */
export type Relogio = string;

/**
 * Uma faixa em que a loja atende.
 *
 * `fecha` antes de `abre` quer dizer que a faixa passa da meia-noite:
 * 18:00 → 02:00 fecha às duas da manhã do dia SEGUINTE. A faixa pertence ao
 * dia em que abre — a sexta que vai até as duas é horário de sexta, e um
 * feriado no sábado não corta a madrugada de sexta para sábado.
 *
 * `fecha` igual a `abre` é o dia inteiro: 00:00 → 00:00 são 24 horas.
 */
export interface FaixaDeHorario {
  abre: Relogio;
  fecha: Relogio;
}

/**
 * Mais de uma faixa por dia porque isso é o comum, e não a exceção: lanchonete
 * que serve almoço e volta à noite fecha das 14h às 18h. Com uma faixa só, ela
 * seria obrigada a declarar um horário que não pratica — e receberia pedido com
 * a cozinha apagada. Dia sem faixa nenhuma é dia fechado.
 */
export interface DiaDeFuncionamento {
  /** 0 = domingo, igual a `Date.getDay()`. */
  dia: number;
  faixas: FaixaDeHorario[];
}

/**
 * Uma data que foge do horário da semana: feriado, férias, reforma, véspera de
 * Natal com horário curto.
 *
 * O horário da semana não sabe o que é 25 de dezembro. Sem esta lista, fechar
 * num feriado exigiria apagar o horário do dia e lembrar de recolocar depois —
 * e quem esquece recebe pedido com a porta fechada.
 *
 * Um período, e não uma data só: férias coletivas ocupam duas semanas, e
 * cadastrá-las dia por dia é o tipo de trabalho que a lojista não faz.
 */
export type TipoDeExcecao = 'FECHADO' | 'HORARIO_ESPECIAL';

export interface ExcecaoDeData {
  id: string;
  /** `AAAA-MM-DD`. */
  inicio: string;
  /** `AAAA-MM-DD`, igual a `inicio` quando é um dia só. */
  fim: string;
  tipo: TipoDeExcecao;
  /** Aparece para o cliente, para ele não achar que a página quebrou. */
  motivo: string;
  /** Só vale em `HORARIO_ESPECIAL`. */
  faixas: FaixaDeHorario[];
}

/**
 * O que a loja decide AGORA, por cima do horário.
 *
 * - `PAUSADA`: pedidos parados por alguns minutos — a cozinha encheu, choveu.
 * - `FECHADA`: fechou antes da hora, ou hoje não abre.
 * - `ABERTA`: atende fora do horário, até uma hora combinada.
 *
 * Abrir NUNCA fica sem fim: esquecido ligado, seria pedido de madrugada
 * chamando motoboy para porta fechada. Fechar e pausar podem ficar "até eu
 * reabrir", porque o erro ali custa venda, e não uma corrida perdida.
 */
export type EstadoManual = 'ABERTA' | 'FECHADA' | 'PAUSADA';

export interface AjusteManual {
  estado: EstadoManual;
  /** ISO. */
  desde: string;
  /** ISO. `null` só para fechar ou pausar "até eu reabrir". */
  ate: string | null;
}

export interface Funcionamento {
  semana: DiaDeFuncionamento[];
  excecoes: ExcecaoDeData[];
  ajuste: AjusteManual | null;
  /** O recado da loja para quando ela está fechada. Vazio: só a situação. */
  mensagemFechada: string;
}

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

/** Segunda primeiro: é como a semana de trabalho é lida aqui. */
export const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** "na segunda", "no sábado" — o artigo muda com o dia. */
export function noDia(dia: number): string {
  const nome = (DIAS_DA_SEMANA[dia] ?? '').toLowerCase();
  return dia === 0 || dia === 6 ? `no ${nome}` : `na ${nome}`;
}

/* ---------------------------------------------------------------------------
 * Relógio e calendário da loja
 * ------------------------------------------------------------------------- */

const MINUTO = 60_000;
const DIA_EM_MINUTOS = 1440;

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DA_LOJA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_LOJA,
  hour: '2-digit',
  minute: '2-digit',
});

interface Momento {
  /** `AAAA-MM-DD` no calendário da loja. */
  data: string;
  /** Minutos desde a meia-noite, no relógio da loja. */
  minutos: number;
}

/** Que dia e que hora o relógio da loja marca num instante. */
export function momentoNaLoja(instante: Date): Momento {
  const partes: Record<string, string> = {};
  for (const parte of PARTES.formatToParts(instante)) partes[parte.type] = parte.value;
  return {
    data: `${partes['year']}-${partes['month']}-${partes['day']}`,
    minutos: Number(partes['hour']) * 60 + Number(partes['minute']),
  };
}

function numerosDaData(data: string): [number, number, number] {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number);
  return [ano, mes, dia];
}

/** Quanto o relógio da loja está à frente do UTC naquele instante (negativo no Brasil). */
function diferencaDoFuso(instanteMs: number): number {
  const { data, minutos } = momentoNaLoja(new Date(instanteMs));
  const [ano, mes, dia] = numerosDaData(data);
  return Date.UTC(ano, mes - 1, dia, 0, minutos) - Math.floor(instanteMs / MINUTO) * MINUTO;
}

/**
 * O instante em que o relógio da loja marca `minutos` no dia `data`.
 *
 * `minutos` pode passar de 1440: 26:00 do dia 5 é 02:00 do dia 6 — é assim que
 * a faixa que passa da meia-noite encontra o fim dela.
 */
export function instanteNaLoja(data: string, minutos: number): Date {
  const [ano, mes, dia] = numerosDaData(data);
  const comoUtc = Date.UTC(ano, mes - 1, dia, 0, minutos);
  const primeiro = comoUtc - diferencaDoFuso(comoUtc);
  // Confere uma vez: perto de uma troca de horário de verão, a diferença
  // medida no palpite pode não ser a do instante certo.
  const conferido = comoUtc - diferencaDoFuso(primeiro);
  return new Date(conferido);
}

export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = numerosDaData(data);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = numerosDaData(de);
  const [a2, m2, d2] = numerosDaData(ate);
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / (DIA_EM_MINUTOS * MINUTO),
  );
}

export function diaDaSemana(data: string): number {
  const [ano, mes, dia] = numerosDaData(data);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** `14:30`, no relógio da loja. */
export function hora(instante: Date): string {
  return HORA.format(instante);
}

/** `25/12`. */
export function dataCurta(data: string): string {
  const [, mes, dia] = numerosDaData(data);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/**
 * "hoje", "amanhã", "sexta", "25/12" — do jeito que se fala, contado a partir de
 * `agora`. Passando de uma semana, o nome do dia fica ambíguo e vira data.
 */
export function rotuloDoDia(data: string, agora: Date): string {
  const distancia = diasEntre(momentoNaLoja(agora).data, data);
  if (distancia === 0) return 'hoje';
  if (distancia === 1) return 'amanhã';
  if (distancia > 1 && distancia < 7)
    return (DIAS_DA_SEMANA[diaDaSemana(data)] ?? '').toLowerCase();
  return dataCurta(data);
}

export function relogioValido(relogio: Relogio): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(relogio);
}

export function dataValida(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data);
}

export function emMinutos(relogio: Relogio): number {
  const [hora = 0, minuto = 0] = relogio.split(':').map(Number);
  return hora * 60 + minuto;
}

export function faixaValida(faixa: FaixaDeHorario): boolean {
  return relogioValido(faixa.abre) && relogioValido(faixa.fecha);
}

/** Quanto a faixa dura. Fechar no mesmo horário em que abre é o dia inteiro. */
export function duracaoDaFaixa(faixa: FaixaDeHorario): number {
  const duracao =
    (emMinutos(faixa.fecha) - emMinutos(faixa.abre) + DIA_EM_MINUTOS) % DIA_EM_MINUTOS;
  return duracao === 0 ? DIA_EM_MINUTOS : duracao;
}

/** Se a faixa termina no dia seguinte. Fechar à meia-noite em ponto não conta. */
export function passaDaMeiaNoite(faixa: FaixaDeHorario): boolean {
  return emMinutos(faixa.abre) + duracaoDaFaixa(faixa) > DIA_EM_MINUTOS;
}

/** O que a tela diz ao lado da faixa, quando ela não é óbvia. */
export function observacaoDaFaixa(faixa: FaixaDeHorario): string | null {
  if (!faixaValida(faixa)) return null;
  if (duracaoDaFaixa(faixa) === DIA_EM_MINUTOS) return '24 horas';
  if (passaDaMeiaNoite(faixa)) return `termina às ${faixa.fecha} do dia seguinte`;
  return null;
}

/* ---------------------------------------------------------------------------
 * Horário de um dia do calendário
 * ------------------------------------------------------------------------- */

/**
 * A exceção que vale numa data. Quando mais de uma cobre o mesmo dia, vence a
 * MAIS CURTA — a véspera de Natal com horário especial dentro de umas férias é
 * a exceção da exceção. Empatadas, vale a acrescentada por último.
 */
export function excecaoDaData(excecoes: ExcecaoDeData[], data: string): ExcecaoDeData | null {
  let escolhida: ExcecaoDeData | null = null;
  let menor = Infinity;
  for (const excecao of excecoes) {
    if (!dataValida(excecao.inicio)) continue;
    const fim = dataValida(excecao.fim) ? excecao.fim : excecao.inicio;
    if (fim < excecao.inicio || data < excecao.inicio || data > fim) continue;
    const dias = diasEntre(excecao.inicio, fim);
    if (dias <= menor) {
      escolhida = excecao;
      menor = dias;
    }
  }
  return escolhida;
}

export function faixasDaData(
  funcionamento: Funcionamento,
  data: string,
): { faixas: FaixaDeHorario[]; excecao: ExcecaoDeData | null } {
  const excecao = excecaoDaData(funcionamento.excecoes, data);
  if (excecao?.tipo === 'FECHADO') return { faixas: [], excecao };
  if (excecao?.tipo === 'HORARIO_ESPECIAL') {
    return { faixas: excecao.faixas.filter(faixaValida), excecao };
  }
  const dia = funcionamento.semana.find((item) => item.dia === diaDaSemana(data));
  return { faixas: (dia?.faixas ?? []).filter(faixaValida), excecao: null };
}

/* ---------------------------------------------------------------------------
 * A linha do tempo: quando a loja está aberta, instante por instante
 * ------------------------------------------------------------------------- */

/** `[inicio, fim)`, em milissegundos. */
interface Intervalo {
  inicio: number;
  fim: number;
}

const SEM_FIM = 8.64e15;

/**
 * Junta o que se encosta ou se sobrepõe. É o que faz a sexta das 18h à
 * meia-noite, seguida do sábado da meia-noite às 2h, ser uma noite só —
 * "aberto até 02:00", e não "aberto até 00:00" dito às 23h.
 */
function juntar(lista: Intervalo[]): Intervalo[] {
  const ordenada = [...lista].sort((a, b) => a.inicio - b.inicio);
  const juntos: Intervalo[] = [];
  for (const item of ordenada) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && item.inicio <= ultimo.fim) {
      ultimo.fim = Math.max(ultimo.fim, item.fim);
    } else {
      juntos.push({ inicio: item.inicio, fim: item.fim });
    }
  }
  return juntos;
}

/** O que o horário (semana e exceções) diz, entre duas datas — sem o ajuste manual. */
function intervalosDoHorario(funcionamento: Funcionamento, de: string, ate: string): Intervalo[] {
  const lista: Intervalo[] = [];
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    for (const faixa of faixasDaData(funcionamento, data).faixas) {
      const abre = emMinutos(faixa.abre);
      lista.push({
        inicio: instanteNaLoja(data, abre).getTime(),
        fim: instanteNaLoja(data, abre + duracaoDaFaixa(faixa)).getTime(),
      });
    }
  }
  return juntar(lista);
}

/** O ajuste só vale enquanto não venceu. Vencido, é como se não existisse. */
export function ajusteVigente(ajuste: AjusteManual | null, agora: Date): AjusteManual | null {
  if (!ajuste) return null;
  if (ajuste.ate !== null && new Date(ajuste.ate).getTime() <= agora.getTime()) return null;
  return ajuste;
}

/** Abrir acrescenta um trecho à linha do tempo; fechar e pausar tiram. */
function aplicarAjuste(intervalos: Intervalo[], ajuste: AjusteManual | null): Intervalo[] {
  if (!ajuste) return intervalos;
  const desde = new Date(ajuste.desde).getTime();
  const ate = ajuste.ate === null ? SEM_FIM : new Date(ajuste.ate).getTime();

  if (ajuste.estado === 'ABERTA') return juntar([...intervalos, { inicio: desde, fim: ate }]);

  const resultado: Intervalo[] = [];
  for (const item of intervalos) {
    if (item.fim <= desde || item.inicio >= ate) {
      resultado.push(item);
      continue;
    }
    if (item.inicio < desde) resultado.push({ inicio: item.inicio, fim: desde });
    if (item.fim > ate) resultado.push({ inicio: ate, fim: item.fim });
  }
  return resultado;
}

/**
 * Até onde olhar para achar a próxima abertura. Dois meses cobrem férias
 * coletivas; além disso a loja está, na prática, sem horário.
 */
const HORIZONTE_EM_DIAS = 62;

function linhaDoTempo(funcionamento: Funcionamento, agora: Date, dias: number) {
  const hoje = momentoNaLoja(agora).data;
  // Começa ontem: a faixa de ontem que passa da meia-noite ainda vale hoje cedo.
  const horario = intervalosDoHorario(funcionamento, somarDias(hoje, -1), somarDias(hoje, dias));
  const efetiva = aplicarAjuste(horario, ajusteVigente(funcionamento.ajuste, agora));
  return { horario, efetiva };
}

function contem(intervalos: Intervalo[], instante: number): Intervalo | undefined {
  return intervalos.find((item) => item.inicio <= instante && instante < item.fim);
}

/* ---------------------------------------------------------------------------
 * A situação da loja agora
 * ------------------------------------------------------------------------- */

/**
 * Por que a loja está como está. O painel precisa disso para oferecer a ação
 * certa — "retomar" só faz sentido para quem pausou — e o cliente, para ler o
 * motivo certo.
 */
export type MotivoDaSituacao =
  'HORARIO' | 'EXCECAO' | 'ABERTA_MANUAL' | 'FECHADA_MANUAL' | 'PAUSADA';

export interface SituacaoDaLoja {
  aberta: boolean;
  motivo: MotivoDaSituacao;
  /** Frase curta, do jeito que o cliente lê. */
  texto: string;
  /**
   * Quando esta situação muda: o fechamento, se aberta; a próxima abertura, se
   * fechada. `null` quando não há previsão.
   */
  muda: Date | null;
  /** A data especial que decide o dia de hoje, quando há uma. */
  excecao: ExcecaoDeData | null;
}

/** "abre às 18:00", "abre amanhã às 11:00", "abre sexta às 11:00", "abre em 12/10 às 11:00". */
function quandoAbre(quando: Date, agora: Date): string {
  const dia = rotuloDoDia(momentoNaLoja(quando).data, agora);
  if (dia === 'hoje') return `abre às ${hora(quando)}`;
  if (dia.includes('/')) return `abre em ${dia} às ${hora(quando)}`;
  return `abre ${dia} às ${hora(quando)}`;
}

/**
 * Se dá para pedir agora, e o que dizer ao cliente.
 *
 * O ajuste manual vence o horário: é para isso que ele existe. Depois dele, o
 * que manda é a data especial, e por fim a semana. Fechada, a frase diz QUANDO
 * abre — "fechado" sozinho faz a pessoa ir embora sem saber se volta em dez
 * minutos ou amanhã.
 */
export function situacaoDaLoja(funcionamento: Funcionamento, agora: Date): SituacaoDaLoja {
  const t = agora.getTime();
  const ajuste = ajusteVigente(funcionamento.ajuste, agora);
  const hoje = momentoNaLoja(agora).data;
  const { excecao } = faixasDaData(funcionamento, hoje);

  let { horario, efetiva } = linhaDoTempo(funcionamento, agora, 8);
  const atual = contem(efetiva, t);

  if (atual) {
    const peloHorario = contem(horario, t) !== undefined;
    // O nome do horário especial só quando a noite aberta começou hoje: à 1h da
    // véspera de Natal, quem ainda está aberta é a noite do dia 23.
    const especial =
      excecao?.tipo === 'HORARIO_ESPECIAL' && atual.inicio >= instanteNaLoja(hoje, 0).getTime();
    const motivo: MotivoDaSituacao = !peloHorario
      ? 'ABERTA_MANUAL'
      : especial
        ? 'EXCECAO'
        : 'HORARIO';
    const nomeEspecial = especial ? (excecao?.motivo.trim() ?? '') : '';

    // Aberta por mais de uma semana seguida é loja 24 horas: "aberto até" uma
    // hora de daqui a oito dias não diz nada a ninguém.
    if (atual.fim >= instanteNaLoja(somarDias(hoje, 7), 0).getTime()) {
      return { aberta: true, motivo, texto: 'Aberto 24 horas', muda: null, excecao };
    }
    const fim = new Date(atual.fim);
    const texto = `Aberto até ${hora(fim)}${nomeEspecial ? ` · ${nomeEspecial}` : ''}`;
    return { aberta: true, motivo, texto, muda: fim, excecao };
  }

  let proxima = efetiva.find((item) => item.inicio > t);
  if (!proxima) {
    ({ horario, efetiva } = linhaDoTempo(funcionamento, agora, HORIZONTE_EM_DIAS));
    proxima = efetiva.find((item) => item.inicio > t);
  }
  const muda = proxima ? new Date(proxima.inicio) : null;
  const abre = muda ? ` · ${quandoAbre(muda, agora)}` : '';

  if (ajuste?.estado === 'PAUSADA') {
    // "Voltam às 20:15" só quando é a própria pausa que acaba. Se ela vai além
    // do fechamento, o que importa ao cliente é quando a loja abre de novo.
    const voltaDaPausa =
      ajuste.ate !== null && muda !== null && muda.getTime() === new Date(ajuste.ate).getTime();
    const texto = voltaDaPausa
      ? `Pedidos pausados · voltam às ${hora(muda)}`
      : `Pedidos pausados${abre}`;
    return { aberta: false, motivo: 'PAUSADA', texto, muda, excecao };
  }

  if (ajuste?.estado === 'FECHADA') {
    return {
      aberta: false,
      motivo: 'FECHADA_MANUAL',
      texto: muda ? `Fechado agora${abre}` : 'Fechado no momento',
      muda,
      excecao,
    };
  }

  if (excecao?.tipo === 'FECHADO') {
    const nome = excecao.motivo.trim();
    const periodo =
      excecao.fim > excecao.inicio ? `Fechado até ${dataCurta(excecao.fim)}` : 'Fechado hoje';
    return {
      aberta: false,
      motivo: 'EXCECAO',
      texto: nome ? `${periodo} · ${nome}` : periodo,
      muda,
      excecao,
    };
  }

  return {
    aberta: false,
    motivo: excecao ? 'EXCECAO' : 'HORARIO',
    texto: muda ? `Fechado${abre}` : 'Fechado',
    muda,
    excecao,
  };
}

/**
 * A próxima vez que o HORÁRIO abre a loja, ignorando o ajuste manual.
 *
 * É o "fechar até a próxima abertura" do painel: fechou numa noite ruim, e
 * amanhã a loja abre sozinha, sem ninguém precisar lembrar de reabrir.
 */
export function proximaAberturaDoHorario(funcionamento: Funcionamento, agora: Date): Date | null {
  const t = agora.getTime();
  const semAjuste = { ...funcionamento, ajuste: null };
  const { horario } = linhaDoTempo(semAjuste, agora, HORIZONTE_EM_DIAS);
  const proxima = horario.find((item) => item.inicio > t);
  return proxima ? new Date(proxima.inicio) : null;
}

/* ---------------------------------------------------------------------------
 * Horários para agendar
 * ------------------------------------------------------------------------- */

export interface RegrasDoAgendamento {
  /** Minutos entre o pedido e o primeiro horário que dá para escolher. */
  antecedenciaMinimaMin: number;
  /** Quantos dias à frente o cliente pode agendar. */
  antecedenciaMaximaDias: number;
  /** De quanto em quanto tempo as janelas começam: 15, 30, 60. */
  intervaloMin: number;
}

export interface DiaParaAgendar {
  /**
   * `AAAA-MM-DD`, no calendário da loja — o dia da NOITE de trabalho: as
   * janelas da madrugada contam na noite em que a cozinha abriu.
   */
  data: string;
  /** Início de cada janela, em ordem. A janela dura `intervaloMin`. */
  horarios: Date[];
}

/** Até que hora a madrugada ainda pertence à noite anterior. */
const FIM_DA_MADRUGADA_MIN = 6 * 60;

/**
 * Os horários que o cliente pode escolher para receber — ou retirar — o pedido.
 *
 * `minutosAntes` é quanto antes do horário escolhido a cozinha precisa
 * começar: o preparo, e na entrega também o caminho. Um horário só é oferecido
 * se a loja estiver aberta nesse momento de começar — agendar é pedir agora
 * para depois, e o pedido entra na cozinha como se tivesse sido feito ali.
 *
 * A pausa e o fechamento manual também valem: a loja que fechou "até amanhã"
 * não recebe pedido para hoje à noite por outro caminho.
 */
export function horariosParaAgendar(
  funcionamento: Funcionamento,
  regras: RegrasDoAgendamento,
  minutosAntes: number,
  agora: Date,
): DiaParaAgendar[] {
  const intervalo = Math.max(5, Math.round(regras.intervaloMin));
  const maximoDias = Math.max(0, Math.round(regras.antecedenciaMaximaDias));
  const maisCedo = agora.getTime() + Math.max(regras.antecedenciaMinimaMin, minutosAntes) * MINUTO;
  const hoje = momentoNaLoja(agora).data;
  const ultimoDia = somarDias(hoje, maximoDias);
  const { efetiva } = linhaDoTempo(funcionamento, agora, maximoDias + 1);

  const porDia = new Map<string, Date[]>();
  for (let data = hoje; data <= ultimoDia; data = somarDias(data, 1)) {
    for (let minuto = 0; minuto < DIA_EM_MINUTOS; minuto += intervalo) {
      const inicio = instanteNaLoja(data, minuto);
      if (inicio.getTime() < maisCedo) continue;
      const aberta = contem(efetiva, inicio.getTime() - minutosAntes * MINUTO);
      if (!aberta) continue;

      // A madrugada fica na noite em que a cozinha abriu. Um "domingo" com três
      // horários depois da meia-noite de sábado faria parecer que a loja abre
      // no domingo; para o cliente, 00:30 é "sábado à noite". A madrugada de
      // hoje continua sendo hoje: não existe escolher "ontem".
      const abriuNoDiaAnterior = momentoNaLoja(new Date(aberta.inicio)).data < data;
      const dia =
        minuto < FIM_DA_MADRUGADA_MIN && abriuNoDiaAnterior && data > hoje
          ? somarDias(data, -1)
          : data;

      const lista = porDia.get(dia);
      if (lista) lista.push(inicio);
      else porDia.set(dia, [inicio]);
    }
  }
  return [...porDia].map(([data, horarios]) => ({ data, horarios }));
}

/* ---------------------------------------------------------------------------
 * Feriados nacionais
 * ------------------------------------------------------------------------- */

export interface Feriado {
  data: string;
  nome: string;
}

/** Domingo de Páscoa, pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Os feriados nacionais de um ano, para a loja escolher em quais fecha.
 *
 * Carnaval e Corpus Christi são ponto facultativo pela lei federal, e não
 * feriado — mas o comércio costuma tratá-los como feriado, e é a lojista quem
 * decide. Por isso a lista é sugestão: nada fecha sem ela acrescentar. Feriado
 * estadual e municipal fica por conta dela; não há como saber a cidade aqui.
 */
export function feriadosNacionais(ano: number): Feriado[] {
  const pascoa = domingoDePascoa(ano);
  return [
    { data: `${ano}-01-01`, nome: 'Confraternização Universal' },
    { data: somarDias(pascoa, -48), nome: 'Carnaval (segunda)' },
    { data: somarDias(pascoa, -47), nome: 'Carnaval (terça)' },
    { data: somarDias(pascoa, -2), nome: 'Sexta-feira Santa' },
    { data: `${ano}-04-21`, nome: 'Tiradentes' },
    { data: `${ano}-05-01`, nome: 'Dia do Trabalho' },
    { data: somarDias(pascoa, 60), nome: 'Corpus Christi' },
    { data: `${ano}-09-07`, nome: 'Independência' },
    { data: `${ano}-10-12`, nome: 'Nossa Senhora Aparecida' },
    { data: `${ano}-11-02`, nome: 'Finados' },
    { data: `${ano}-11-15`, nome: 'Proclamação da República' },
    { data: `${ano}-11-20`, nome: 'Consciência Negra' },
    { data: `${ano}-12-25`, nome: 'Natal' },
  ].sort((a, b) => a.data.localeCompare(b.data));
}

/** Os feriados de hoje até `dias` à frente. */
export function proximosFeriados(agora: Date, dias = 365): Feriado[] {
  const hoje = momentoNaLoja(agora).data;
  const ate = somarDias(hoje, dias);
  const ano = Number(hoje.slice(0, 4));
  return [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].filter(
    (feriado) => feriado.data >= hoje && feriado.data <= ate,
  );
}

/* ---------------------------------------------------------------------------
 * O que conferir antes de salvar
 * ------------------------------------------------------------------------- */

export interface ProblemaDoHorario {
  texto: string;
  /**
   * Grave: a página deixa de aceitar pedido, ou aceita no horário errado. Não
   * grave: funciona, mas provavelmente não é o que a loja quis dizer.
   */
  grave: boolean;
}

function faixaEmTexto(faixa: FaixaDeHorario): string {
  return `${faixa.abre}–${faixa.fecha}`;
}

function rotuloDaExcecao(excecao: ExcecaoDeData): string {
  const nome = excecao.motivo.trim();
  if (nome) return `"${nome}"`;
  return dataValida(excecao.inicio) ? `A data ${dataCurta(excecao.inicio)}` : 'Uma data especial';
}

export function problemasDoHorario(
  funcionamento: Funcionamento,
  hoje: string,
): ProblemaDoHorario[] {
  const problemas: ProblemaDoHorario[] = [];

  for (const dia of ORDEM_DA_SEMANA) {
    const todas = funcionamento.semana.find((item) => item.dia === dia)?.faixas ?? [];
    if (todas.some((faixa) => !faixaValida(faixa))) {
      problemas.push({ texto: `Um horário ${noDia(dia)} está incompleto.`, grave: true });
    }

    const faixas = todas.filter(faixaValida).sort((a, b) => emMinutos(a.abre) - emMinutos(b.abre));
    for (let i = 1; i < faixas.length; i += 1) {
      const anterior = faixas[i - 1]!;
      const atual = faixas[i]!;
      if (emMinutos(atual.abre) < emMinutos(anterior.abre) + duracaoDaFaixa(anterior)) {
        const quando = noDia(dia);
        problemas.push({
          texto: `${quando.charAt(0).toUpperCase()}${quando.slice(1)}, ${faixaEmTexto(anterior)} e ${faixaEmTexto(atual)} se sobrepõem.`,
          grave: false,
        });
      }
    }

    // A madrugada que entra no dia seguinte e encontra a abertura dele.
    const seguinte = (dia + 1) % 7;
    const doSeguinte = (
      funcionamento.semana.find((item) => item.dia === seguinte)?.faixas ?? []
    ).filter(faixaValida);
    for (const faixa of faixas.filter(passaDaMeiaNoite)) {
      const sobra = emMinutos(faixa.abre) + duracaoDaFaixa(faixa) - DIA_EM_MINUTOS;
      const invadida = doSeguinte.find((outra) => emMinutos(outra.abre) < sobra);
      if (invadida) {
        problemas.push({
          texto: `A faixa de ${(DIAS_DA_SEMANA[dia] ?? '').toLowerCase()} que vai até ${faixa.fecha} entra no horário de ${(DIAS_DA_SEMANA[seguinte] ?? '').toLowerCase()}, que abre às ${invadida.abre}.`,
          grave: false,
        });
      }
    }
  }

  const algumDia = funcionamento.semana.some((dia) => dia.faixas.some(faixaValida));
  const algumEspecial = funcionamento.excecoes.some(
    (excecao) =>
      excecao.tipo === 'HORARIO_ESPECIAL' &&
      excecao.faixas.some(faixaValida) &&
      (dataValida(excecao.fim) ? excecao.fim : excecao.inicio) >= hoje,
  );
  if (!algumDia && !algumEspecial) {
    problemas.push({
      texto: 'Nenhum dia com horário: sua página não aceita pedido em dia nenhum.',
      grave: true,
    });
  }

  for (const excecao of funcionamento.excecoes) {
    if (!dataValida(excecao.inicio)) {
      problemas.push({ texto: `${rotuloDaExcecao(excecao)} está sem data.`, grave: true });
      continue;
    }
    if (dataValida(excecao.fim) && excecao.fim < excecao.inicio) {
      problemas.push({
        texto: `${rotuloDaExcecao(excecao)} termina antes de começar.`,
        grave: true,
      });
    }
    if (excecao.tipo === 'HORARIO_ESPECIAL') {
      if (excecao.faixas.length === 0) {
        problemas.push({
          texto: `${rotuloDaExcecao(excecao)} está como horário especial, mas sem horário. Para não abrir, use "Fechado".`,
          grave: true,
        });
      } else if (excecao.faixas.some((faixa) => !faixaValida(faixa))) {
        problemas.push({
          texto: `Um horário de ${rotuloDaExcecao(excecao)} está incompleto.`,
          grave: true,
        });
      }
    }
  }

  // Duas datas especiais no mesmo dia: funciona (vale a mais curta), mas quase
  // sempre é esquecimento, e a lojista precisa saber qual está valendo.
  const validas = funcionamento.excecoes.filter(
    (excecao) =>
      dataValida(excecao.inicio) && (!dataValida(excecao.fim) || excecao.fim >= excecao.inicio),
  );
  for (let i = 0; i < validas.length; i += 1) {
    for (let j = i + 1; j < validas.length; j += 1) {
      const a = validas[i]!;
      const b = validas[j]!;
      const fimA = dataValida(a.fim) ? a.fim : a.inicio;
      const fimB = dataValida(b.fim) ? b.fim : b.inicio;
      if (a.inicio <= fimB && b.inicio <= fimA) {
        const dia = a.inicio > b.inicio ? a.inicio : b.inicio;
        const nome = excecaoDaData([a, b], dia)?.motivo.trim();
        problemas.push({
          texto: `${dataCurta(dia)} está em duas datas especiais; vale a mais curta${nome ? ` ("${nome}")` : ''}.`,
          grave: false,
        });
      }
    }
  }

  return problemas;
}
