package com.motoboycity.driverapp

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Recebe o push e, para OFERTA, abre a tela cheia sobre o que estiver no
 * aparelho.
 *
 * Por que precisa ser aqui e nao no JavaScript: uma mensagem com bloco
 * `notification` e desenhada pelo proprio Android e o aplicativo nunca e
 * chamado — dai nao ha como pedir tela cheia. Só mensagem de DADOS chega neste
 * metodo com o aplicativo em segundo plano, e so daqui da para montar a
 * notificacao com `setFullScreenIntent`.
 *
 * O preco dessa escolha esta documentado em docs/push-notifications-setup.md: se
 * o sistema tiver ENCERRADO o aplicativo a forca, este metodo nao roda e nada
 * aparece. E por isso que o aplicativo tambem busca a oferta pendente ao abrir.
 */
class OfferMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)

    val dados = message.data
    val ehOferta = dados["type"] == "offer"
    val titulo = dados["title"] ?: if (ehOferta) "Nova entrega para voce" else "MOTOboyCity"
    val corpo = dados["body"] ?: ""

    val manager = getSystemService(NotificationManager::class.java) ?: return

    /**
     * Abre o aplicativo na rota da oferta. `singleTask` no manifesto garante que
     * um aplicativo ja aberto seja trazido para frente em vez de duplicado.
     */
    val intent =
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("abrirOferta", ehOferta)
        dados["offerId"]?.let { putExtra("offerId", it) }
      }
    val pendente =
      PendingIntent.getActivity(
        this,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val builder =
      NotificationCompat.Builder(this, if (ehOferta) "ofertas" else "avisos")
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(titulo)
        .setContentText(corpo)
        .setAutoCancel(true)
        .setContentIntent(pendente)

    if (ehOferta) {
      builder
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        /**
         * `CATEGORY_CALL` nao e enfeite: e o que faz o Android tratar a
         * notificacao como algo que interrompe, inclusive no modo Nao Perturbe
         * quando o motoboy tiver liberado chamadas.
         */
        .setCategory(NotificationCompat.CATEGORY_CALL)
        /**
         * `true` no segundo argumento significa "mostre a tela cheia mesmo com o
         * aparelho desbloqueado".
         *
         * Se a permissao de tela cheia nao estiver concedida — no Android 14+ ela
         * precisa ser liberada a mao para aplicativos que nao sao de chamada —, o
         * Android REBAIXA sozinho para notificacao normal com som, em vez de
         * descartar. E a degradacao certa: pior que a tela cheia, melhor que
         * silencio.
         */
        .setFullScreenIntent(pendente, true)
        .setOngoing(false)
    }

    manager.notify(if (ehOferta) OFFER_NOTIFICATION_ID else corpo.hashCode(), builder.build())
  }

  /**
   * O token novo e registrado pelo JavaScript, que tem a sessao do motoboy.
   * Aqui nao ha como saber de quem e o aparelho.
   */
  override fun onNewToken(token: String) {
    super.onNewToken(token)
  }

  companion object {
    /**
     * Id fixo para a oferta: uma nova substitui a anterior na bandeja em vez de
     * empilhar. So existe uma oferta esperando resposta por vez.
     */
    private const val OFFER_NOTIFICATION_ID = 1001
  }
}
