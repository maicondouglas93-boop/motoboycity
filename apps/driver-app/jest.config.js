module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // pnpm guarda pacotes em node_modules/.pnpm/<pkg>@<versão>/node_modules/<pkg>,
  // então o transformIgnorePatterns padrão do preset (que só olha o que vem
  // logo após "node_modules/") nunca vê "react-native" ali — vê ".pnpm/" antes.
  // O "(?!.*react-native)" varre o restante do caminho inteiro, não só o que
  // vem imediatamente em seguida.
  transformIgnorePatterns: ['node_modules/(?!.*(react-native|@react-navigation))'],
};
