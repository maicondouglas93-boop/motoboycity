const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { resolveAppConfig } = require('./app.env');

const workspaceRoot = path.resolve(__dirname, '../..');

/**
 * A chave de cache do Metro deriva do conteudo dos arquivos de configuracao,
 * nao das variaveis de ambiente que eles leem. Sem isto, trocar
 * MOTOBOYCITY_APP_ENV reaproveitaria transformacoes em cache e o bundle sairia
 * com a URL do ambiente anterior — um APK de piloto apontando para localhost.
 */
const { appEnv, apiBaseUrl } = resolveAppConfig(process.env);

/**
 * pnpm instala pacotes via symlinks (content-addressable store), então o
 * resolver do Metro precisa de unstable_enableSymlinks para enxergá-los.
 * watchFolders inclui a raiz do monorepo para resolver pacotes do workspace
 * (packages/*) no futuro.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  cacheVersion: `motoboycity-${appEnv}-${apiBaseUrl}`,
  watchFolders: [workspaceRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
