/**
 * Ajustes no manifesto de dependencias de terceiros, antes de o pnpm resolver.
 *
 * `@firebase/auth` (do `firebase` web, usado no login do cliente da loja
 * online) declara `@react-native-async-storage/async-storage` como peer
 * opcional. O pnpm resolve peer opcional com o que achar no workspace: achava o
 * do driver-app e, no contexto do company-web (React 19.2.8), criava uma
 * segunda copia do react-native. Essa copia ia para o `node_modules/.pnpm`
 * icado, e o `@react-native/jest-preset` do driver-app (que acha o react-native
 * por ali) passava a carregar a copia com o React errado: "Invalid hook call"
 * nos testes, e o mesmo risco no bundle do app. O login web nao usa a
 * persistencia do React Native, entao o peer sai.
 */
function readPackage(pkg) {
  if (pkg.name === '@firebase/auth') {
    delete pkg.peerDependencies?.['@react-native-async-storage/async-storage'];
    delete pkg.peerDependenciesMeta?.['@react-native-async-storage/async-storage'];
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
