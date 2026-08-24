/**
 * Paleta do aplicativo do motoboy.
 *
 * O aplicativo e CLARO em qualquer aparelho, de proposito. Ele e usado na rua,
 * na moto, com sol batendo na tela — e a leitura no claro e melhor nessa
 * condicao. Antes ele seguia o tema do celular, e quem estava no modo escuro
 * via um aplicativo completamente diferente do que a gente desenhou.
 *
 * Os tons `*Dark` continuam aqui porque telas ainda nao migradas os usam. Elas
 * saem conforme a migracao anda; nao use em tela nova.
 */
export const colors = {
  // --- superficies ---
  /** Fundo do mapa enquanto ele nao carrega, e das areas fora da folha. */
  mapBackdrop: '#e8ede7',
  surface: '#ffffff',
  surfaceMuted: '#f7f8fa',
  /** Trilho da aba inativa e fundo de campos. */
  track: '#eef1f4',
  divider: '#e4e8ee',

  // --- texto ---
  /** Titulos e o que precisa de peso. */
  ink: '#35445c',
  /** Texto corrido. */
  inkSoft: '#596a82',
  /** Apoio, endereco secundario, legenda. */
  inkMuted: '#8b97a8',

  // --- acoes ---
  /** Botao principal: preto chapado, como "Aceitar Pedidos". */
  action: '#17191d',
  actionText: '#ffffff',
  /** Botao secundario, tom navy. */
  actionSoft: '#536684',
  actionSoftTint: '#edf1f7',

  // --- estados ---
  success: '#43b75d',
  successSoft: '#e9f8ed',
  danger: '#e44747',
  dangerSoft: '#fff0f0',
  /** Cronometro correndo: vermelho cheio, mais forte que o `danger` de erro. */
  countdown: '#e03131',
  warning: '#f59f0b',
  warningSoft: '#fff4cf',
  link: '#2f80ed',

  // --- mapa ilustrativo (substituido pelo provedor nativo quando configurado) ---
  mapLand: '#e9efe7',
  mapBlock: '#f4f5f0',
  mapRoad: '#ffffff',
  mapHighway: '#f2dca0',
  mapWater: '#b7dce7',

  // --- legado: telas ainda nao migradas ---
  background: '#ffffff',
  backgroundDark: '#ffffff',
  surfaceDark: '#ffffff',
  border: '#e4e8ee',
  borderDark: '#e4e8ee',
  text: '#35445c',
  textDark: '#35445c',
  muted: '#8b97a8',
  mutedDark: '#8b97a8',
  primary: '#17191d',
  primaryDark: '#17191d',
} as const;
