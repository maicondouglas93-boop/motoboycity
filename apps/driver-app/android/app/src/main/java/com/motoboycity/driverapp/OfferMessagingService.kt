package com.motoboycity.driverapp

import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService

/**
 * Recebe o push e apresenta a OFERTA como notificacao nativa acionavel. Em
 * segundo plano, pede tela cheia sobre o app atual ou a tela bloqueada.
 *
 * Por que precisa ser aqui e nao no JavaScript: uma mensagem com bloco
 * `notification` e desenhada pelo proprio Android e o aplicativo nunca e
 * chamado — dai nao ha como pedir tela cheia. Só mensagem de DADOS chega neste
 * metodo com o aplicativo em segundo plano, e so daqui da para montar a
 * notificacao com `setFullScreenIntent`.
 *
 * A recuperacao da oferta pendente ao abrir cobre o unico bloqueio incontornavel
 * do Android: uma parada forcada explicita pelo usuario.
 */
class OfferMessagingService : ReactNativeFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)

    val dados = message.data
    if (dados["type"] == "offer-resolved") {
      resolverApresentacaoDaOferta(dados)
      return
    }

    val ehOferta = dados["type"] == "offer"
    val offerId = dados["offerId"].orEmpty()
    if (ehOferta && (offerId.isBlank() || OfferSessionStore.ofertaFoiResolvidaRecentemente(this, offerId))) {
      return
    }
    val expiresAtMs = dados["expiresAtEpochMs"]?.toLongOrNull()
    val remainingMs = expiresAtMs?.minus(System.currentTimeMillis())
    if (ehOferta && remainingMs != null && remainingMs <= 0L) {
      OfferSessionStore.marcarOfertaResolvida(this, offerId)
      return
    }
    val titulo = dados["title"] ?: if (ehOferta) "Pedido disponível" else "MOTOboyCity"
    val corpo = dados["body"] ?: ""
    val appEmPrimeiroPlano = aplicativoEmPrimeiroPlano()

    val manager = getSystemService(NotificationManager::class.java) ?: return

    /**
     * Abre o aplicativo na rota da oferta. `singleTask` no manifesto garante que
     * um aplicativo ja aberto seja trazido para frente em vez de duplicado.
     */
    val destino = if (ehOferta) OfferActivity::class.java else MainActivity::class.java
    val intent =
      Intent(this, destino).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("abrirOferta", ehOferta)
        putExtra(OfferActivity.EXTRA_OFFER_ID, offerId)
        expiresAtMs?.let { putExtra(OfferActivity.EXTRA_EXPIRES_AT_EPOCH_MS, it) }
      }
    val pendingIntentOptions =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        ActivityOptions.makeBasic()
          .setPendingIntentCreatorBackgroundActivityStartMode(
            ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED,
          )
          .toBundle()
      } else {
        null
      }
    val pendente =
      PendingIntent.getActivity(
        this,
        offerId.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        pendingIntentOptions,
      )

    val builder =
      NotificationCompat.Builder(this, if (ehOferta) "ofertas" else "avisos")
        .setSmallIcon(R.drawable.ic_stat_motoboycity)
        .setColor(Color.rgb(8, 68, 76))
        .setContentTitle(titulo)
        .setContentText(corpo)
        .setStyle(NotificationCompat.BigTextStyle().bigText(corpo))
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setContentIntent(pendente)

    if (ehOferta) {
      /**
       * Os dois botoes na PROPRIA notificacao.
       *
       * E o ponto do recurso: o motoboy resolve num toque, com o celular no
       * bolso, sem abrir o aplicativo. Cada botao dispara o
       * `OfferActionReceiver`, que chama a API — nao abre tela nenhuma.
       *
       * `offerId` no `data` da requisicao do codigo do PendingIntent: sem isso,
       * duas ofertas seguidas reusariam o mesmo PendingIntent e a segunda
       * responderia pelo id da primeira.
       */
      builder
        .setPriority(NotificationCompat.PRIORITY_MAX)
        /**
         * CATEGORY_CALL, e não CATEGORY_EVENT.
         *
         * Do Android 14 em diante o sistema só deixa a tela cheia TOMAR a tela
         * em notificação de chamada ou alarme. Em qualquer outra categoria ele
         * rebaixa para faixa no topo, mesmo com `USE_FULL_SCREEN_INTENT`
         * concedida — foi exatamente o que aconteceu quando isto virou
         * CATEGORY_EVENT: a oferta chegou como faixa, o motoboy não viu, e ela
         * expirou sozinha.
         *
         * A escolha é deliberada. A oferta tem cronômetro de segundos e o
         * motoboy está na moto: se ela não interromper, ela não existe. É o
         * mesmo tratamento que o aplicativo do concorrente dá.
         *
         * Consequência a assumir: a Play Store revisa o uso de
         * `USE_FULL_SCREEN_INTENT` fora de apps de chamada, e pode pedir
         * justificativa na publicação.
         */
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setOngoing(false)

      val timeoutMs =
        remainingMs?.coerceAtLeast(1_000L)
          ?: dados["expiresInSeconds"]?.toLongOrNull()?.coerceAtLeast(1L)?.times(1_000L)
      timeoutMs?.let { builder.setTimeoutAfter(it + 5_000L) }

      // Mesmo com o app aberto, a notificacao nativa continua acionavel. Se o
      // socket estiver reconectando, os botoes ainda respondem pela API.
      val aceitar = acaoPendente(OfferActionReceiver.ACTION_ACCEPT, offerId)
      val recusar = acaoPendente(OfferActionReceiver.ACTION_DECLINE, offerId)
      builder
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Recusar", recusar)
        .addAction(android.R.drawable.ic_menu_send, "Aceitar", aceitar)

      if (!appEmPrimeiroPlano) {
        builder
          /**
           * Em segundo plano, o PendingIntent abre a Activity translúcida sobre
           * a tela bloqueada ou o app atual. No Android 14+ sem acesso especial,
           * o sistema degrada para um heads-up expandido; tocar nele abre o mesmo
           * cartão.
           */
          .setFullScreenIntent(pendente, true)
      }

      OfferSessionStore.marcarOfertaApresentada(this, offerId)
    }

    manager.notify(
      if (ehOferta) OfferActionReceiver.OFFER_NOTIFICATION_ID else corpo.hashCode(),
      builder.build(),
    )

    if (ehOferta && !appEmPrimeiroPlano) {
      abrirOfertaSobreOutrosApps(intent, offerId)
    }
  }

  /**
   * Android 13+ sempre prefere heads-up enquanto o aparelho esta desbloqueado,
   * mesmo com full-screen intent autorizado. Quando o motoboy liberou
   * explicitamente "Exibir sobre outros apps", SYSTEM_ALERT_WINDOW tambem e
   * uma excecao oficial para iniciar a Activity a partir do segundo plano.
   *
   * A notificacao ja foi publicada antes desta tentativa. Assim, uma restricao
   * adicional do fabricante nunca faz a oferta desaparecer: ela continua com
   * os botoes Aceitar/Recusar como fallback.
   */
  private fun abrirOfertaSobreOutrosApps(intent: Intent, offerId: String) {
    val autorizado =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    if (!autorizado) return

    try {
      startActivity(
        Intent(intent).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        },
      )
      Log.i(TAG, "Oferta nativa aberta sobre outros apps: ${offerId.take(8)}")
    } catch (error: Exception) {
      Log.w(TAG, "Fabricante bloqueou a abertura sobre outros apps; mantendo notificacao", error)
    }
  }

  private fun acaoPendente(acao: String, offerId: String): PendingIntent {
    val intent =
      Intent(this, OfferActionReceiver::class.java).apply {
        this.action = acao
        putExtra(OfferActionReceiver.EXTRA_OFFER_ID, offerId)
      }
    return PendingIntent.getBroadcast(
      this,
      (acao + offerId).hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Fecha somente a oferta a que a atualizacao do servidor se refere. */
  private fun resolverApresentacaoDaOferta(dados: Map<String, String>) {
    val offerIds =
      dados["offerIds"]
        ?.split(',')
        ?.map(String::trim)
        ?.filter(String::isNotBlank)
        .orEmpty()
        .ifEmpty { listOfNotNull(dados["offerId"]?.takeIf(String::isNotBlank)) }
    if (offerIds.isEmpty()) return

    val atual = OfferSessionStore.ofertaAtual(this)
    if (atual != null && atual !in offerIds) return
    val resolvida = atual ?: offerIds.first()
    ForegroundOfferAlarm.stop(resolvida)
    OfferSessionStore.marcarOfertaResolvida(this, resolvida)
    getSystemService(NotificationManager::class.java)?.cancel(
      OfferActionReceiver.OFFER_NOTIFICATION_ID,
    )
    OfferActivity.notifyResolved(this, resolvida)
  }

  /**
   * Com o app aberto, o Socket.IO já leva para a tela React Native da oferta.
   * Abrir a Activity nativa junto criaria dois cartões e duas respostas para o
   * mesmo id. Nesse estado a notificação fica apenas como faixa do sistema.
   */
  private fun aplicativoEmPrimeiroPlano(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  /**
   * O token novo e registrado pelo JavaScript, que tem a sessao do motoboy.
   * Aqui nao ha como saber de quem e o aparelho.
   */
  override fun onNewToken(token: String) {
    super.onNewToken(token)
  }

  companion object {
    private const val TAG = "OfferMessagingService"
  }

}
