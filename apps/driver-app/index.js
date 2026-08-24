/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

/**
 * Handler de push com o aplicativo em segundo plano ou encerrado.
 *
 * Precisa ser registrado AQUI, fora do React: quando a mensagem chega com o app
 * encerrado, o Android sobe um contexto headless em que nenhum componente
 * existe ainda.
 *
 * O corpo e vazio de proposito. A oferta chega como mensagem de dados e e
 * apresentada pelo `OfferMessagingService`, que monta a notificacao nativa com
 * acoes e tela cheia. Este handler permanece registrado para o ciclo de vida
 * do modulo React Native e para futuras tarefas headless que nao sejam a
 * apresentacao da oferta.
 */
/**
 * Protegido porque SEM `google-services.json` o Firebase nao inicializa, e
 * `getMessaging()` lanca aqui — na carga do modulo, antes de qualquer tela.
 * Isso derrubaria o aplicativo na abertura, trocando "sem push" por "sem
 * aplicativo".
 */
try {
  setBackgroundMessageHandler(getMessaging(), async () => {});
} catch {
  // Sem credencial do Firebase: o aplicativo funciona, so nao recebe push.
}

AppRegistry.registerComponent(appName, () => App);
