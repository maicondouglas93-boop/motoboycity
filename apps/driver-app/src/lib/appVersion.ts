/**
 * Versao visivel do aplicativo (portao P0.3).
 *
 * Nao edite este valor: ele vem do `version` do `package.json` do driver-app,
 * inlinado em tempo de build pelo plugin Babel de `babel.config.js`, e o
 * `versionName` do Android le do mesmo lugar. Manter uma constante escrita a
 * mao aqui foi o que permitiu que o JavaScript dissesse `0.0.1` enquanto o
 * Android dizia `1.0`.
 *
 * Para publicar uma versao nova, altere `version` no `package.json` e informe
 * um `versionCode` maior no comando de build do Android.
 */
declare const __MOTOBOYCITY_APP_VERSION__: string;

export const DRIVER_APP_VERSION = __MOTOBOYCITY_APP_VERSION__;
