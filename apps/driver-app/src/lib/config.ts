/**
 * Configuracao de ambiente do driver-app (portao P0.2).
 *
 * Os dois identificadores abaixo nao existem em runtime: o plugin Babel local
 * declarado em `babel.config.js` os substitui por literais durante o bundle,
 * a partir de `app.env.js`. Ou seja, a URL fica congelada no artefato e o APK
 * funciona sem Metro, sem USB e sem `adb reverse`.
 *
 * Para escolher o ambiente, defina `MOTOBOYCITY_APP_ENV`
 * (`development` | `pilot` | `production`) e, em pilot/production,
 * `MOTOBOYCITY_API_URL`. As regras de validacao vivem em `app.env.js` e
 * falham o build, nao o runtime.
 *
 * Em desenvolvimento com aparelho fisico via USB, o padrao continua sendo
 * `http://localhost:3333` com `adb reverse tcp:3333 tcp:3333`. Em emulador
 * Android, use `MOTOBOYCITY_API_URL=http://10.0.2.2:3333`.
 */
declare const __MOTOBOYCITY_APP_ENV__: string;
declare const __MOTOBOYCITY_API_URL__: string;

export type AppEnv = 'development' | 'pilot' | 'production';

export const APP_ENV = __MOTOBOYCITY_APP_ENV__ as AppEnv;

export const API_BASE_URL = __MOTOBOYCITY_API_URL__;

/** Rotulo curto para diagnostico na tela de ajustes. */
export const APP_ENV_LABEL: Record<AppEnv, string> = {
  development: 'Desenvolvimento',
  pilot: 'Piloto',
  production: 'Producao',
};
