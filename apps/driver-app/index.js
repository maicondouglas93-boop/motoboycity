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
 * O corpo e vazio de proposito. A notificacao em si e desenhada pelo proprio
 * Android a partir do bloco `notification` que o servidor manda, e e isso que
 * garante que ela apareca e toque mesmo sem o aplicativo rodar. Este handler
 * so precisa existir para o modulo nativo nao reclamar, e e o lugar de
 * eventuais tarefas de fundo no futuro.
 */
setBackgroundMessageHandler(getMessaging(), async () => {});

AppRegistry.registerComponent(appName, () => App);
