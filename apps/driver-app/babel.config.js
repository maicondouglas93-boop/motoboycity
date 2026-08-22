const { resolveAppConfig } = require('./app.env');

/**
 * Resolvido no escopo do modulo de proposito: se a configuracao for invalida
 * (URL vazia, HTTP, localhost ou IP privado em pilot/production), o build
 * falha aqui, antes de gerar bundle — em vez de produzir um APK que so
 * quebra na rua.
 */
const buildConfig = resolveAppConfig(process.env);

/**
 * Plugin local em vez de `babel-plugin-transform-inline-environment-variables`:
 * o driver-app evita dependencia nova so para isso, e `@babel/core` ja esta
 * instalado. Substitui os identificadores por literais, congelando a URL no
 * artefato.
 */
function inlineBuildConstants({ types: t }, options) {
  /**
   * Map, e nao objeto literal: com objeto, um identificador chamado
   * `toString` ou `constructor` (que existe no codigo do React) acharia o
   * metodo herdado de Object.prototype e o plugin tentaria inlinar uma funcao
   * como string, quebrando o bundle inteiro.
   */
  const constants = new Map([
    ['__MOTOBOYCITY_APP_ENV__', options.appEnv],
    ['__MOTOBOYCITY_API_URL__', options.apiBaseUrl],
    ['__MOTOBOYCITY_APP_VERSION__', options.appVersion],
  ]);

  return {
    name: 'motoboycity-inline-build-constants',
    visitor: {
      Identifier(path) {
        if (!constants.has(path.node.name) || !path.isReferencedIdentifier()) {
          return;
        }
        path.replaceWith(t.stringLiteral(constants.get(path.node.name)));
      },
    },
  };
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [[inlineBuildConstants, buildConfig]],
};
