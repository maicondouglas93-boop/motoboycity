/**
 * Como a loja online funciona: o horário, o ajuste da hora, os tipos de pedido
 * e os avisos. É o que o painel configura em Horários, Tipos de pedido e
 * Notificações — e o que a página do cliente obedece.
 *
 * Os nomes são os das telas, em português, de propósito: o JSON que o banco
 * guarda é o mesmo que o painel edita e que as regras de horário
 * (`lib/loja-horario.ts` no painel) já leem. Traduzir para o contrato criaria
 * uma camada de conversão só para ela poder errar.
 *
 * Toda hora é do FUSO DA LOJA (`America/Sao_Paulo`), e não do aparelho.
 */

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
 * Mais de uma faixa por dia porque isso é o comum: a lanchonete que serve
 * almoço e volta à noite fecha das 14h às 18h. Dia sem faixa é dia fechado.
 */
export interface DiaDeFuncionamento {
  /** 0 = domingo, igual a `Date.getDay()`. */
  dia: number;
  faixas: FaixaDeHorario[];
}

/**
 * Uma data que foge do horário da semana: feriado, férias, reforma, véspera de
 * Natal com horário curto. Um período, e não uma data só: férias coletivas
 * ocupam duas semanas.
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

export interface RegrasDoAgendamento {
  /** Minutos entre o pedido e o primeiro horário que dá para escolher. */
  antecedenciaMinimaMin: number;
  /** Quantos dias à frente o cliente pode agendar. */
  antecedenciaMaximaDias: number;
  /** De quanto em quanto tempo as janelas começam: 15, 30, 60. */
  intervaloMin: number;
}

/**
 * Automático: o pedido entra aceito e vai para a fila da cozinha sozinho.
 * Manual: cada pedido espera alguém da loja aceitar.
 */
export type ModoDeAceite = 'AUTOMATICO' | 'MANUAL';

/**
 * Quem leva o pedido de entrega até o cliente: o motoboy do MOTOboyCity, ou o
 * entregador da própria loja — e aí o pedido não entra na lista do MOTOboyCity.
 */
export type QuemEntrega = 'MOTOBOYCITY' | 'LOJA';

export type EventoDoLojista =
  'NOVO_PEDIDO' | 'PEDIDO_CANCELADO' | 'PEDIDO_AGENDADO' | 'PAGAMENTO_RECEBIDO' | 'LOJA_FECHANDO';

export type EventoDoCliente =
  | 'RECEBIDO'
  | 'ACEITO'
  | 'EM_PREPARO'
  | 'PRONTO_PARA_RETIRAR'
  | 'SAIU_PARA_ENTREGA'
  | 'ENTREGUE'
  | 'CANCELADO';

/** O mesmo formato do endereço da empresa. */
export interface EnderecoDeRetirada {
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface NotificacaoDoLojista {
  push: boolean;
  som: boolean;
}

/**
 * Como o cliente paga: agora, online pelo Asaas — direto na conta da loja —, ou
 * na entrega, em dinheiro ou na maquininha da loja. Crédito e débito online
 * passam pela página do próprio Asaas; nenhum número de cartão toca o sistema.
 */
export type FormaDePagamento =
  | 'PIX_ONLINE'
  | 'CREDITO_ONLINE'
  | 'DEBITO_ONLINE'
  | 'DINHEIRO'
  | 'PIX_MAQUININHA'
  | 'CREDITO_MAQUININHA'
  | 'DEBITO_MAQUININHA';

export type GrupoDePagamento = 'ONLINE' | 'ENTREGA';

/**
 * Um bairro que a loja atende, com a taxa que ELA cobra do cliente — que não é
 * o que a central cobra dela na fatura. Bairro fora da lista não pede entrega:
 * é assim que a loja limita a área.
 */
export interface BairroAtendido {
  id: string;
  nome: string;
  taxa: number;
}

/**
 * Os tempos ficam num lugar só, no recebimento. O "tempo estimado" da entrega e
 * o "tempo de preparo" da retirada são o que o cliente VÊ desses dois números,
 * e não campos à parte.
 */
export interface OperacaoDaLoja {
  funcionamento: Funcionamento;
  recebimento: {
    modo: ModoDeAceite;
    /** Padrão. No aceite manual, a loja pode mudar pedido a pedido ao aceitar. */
    minutosDePreparo: number;
    /** O caminho do motoboy, da loja até o cliente, em média. */
    minutosDeEntrega: number;
    /**
     * No aceite manual: sem ninguém aceitar nesse tempo, o pedido é cancelado e
     * o cliente avisado. `null`: não cancela sozinho.
     */
    prazoDoAceiteMin: number | null;
  };
  entrega: {
    ativa: boolean;
    quemEntrega: QuemEntrega;
    /** Conta só os itens, sem a taxa. `null`: sem mínimo. */
    pedidoMinimo: number | null;
    agendamento: boolean;
    /**
     * O tipo de serviço da corrida que nasce do pedido, quando o MOTOboyCity
     * entrega. `null`: o primeiro tipo ativo, como no botão "Chamar".
     */
    tipoDeServicoId: string | null;
  };
  retirada: {
    ativa: boolean;
    /** `null`: o endereço da empresa, o mesmo de onde o motoboy retira. */
    endereco: EnderecoDeRetirada | null;
    /** "Retire no balcão lateral, com o número do pedido." */
    instrucoes: string;
    agendamento: boolean;
  };
  agendamento: RegrasDoAgendamento & { permitir: boolean };
  notificacoes: {
    lojista: Record<EventoDoLojista, NotificacaoDoLojista>;
    minutosAntesDeFechar: number;
    /** No aceite manual, o som repete enquanto houver pedido esperando. */
    repetirSom: boolean;
    cliente: Record<EventoDoCliente, boolean>;
  };
  /** As formas que a loja aceita. As online só valem com a conta Asaas da loja. */
  pagamentos: FormaDePagamento[];
  /** Os bairros atendidos na entrega. Sem nenhum, a página não aceita entrega. */
  bairros: BairroAtendido[];
}

/** O que a página do cliente recebe: tudo, menos como a loja quer ser avisada. */
export type OperacaoPublica = Omit<OperacaoDaLoja, 'notificacoes'>;
