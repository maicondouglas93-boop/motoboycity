package com.motoboycity.driverapp

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * Responde a oferta direto da NOTIFICACAO, sem o motoboy abrir o aplicativo.
 *
 * E o ponto do recurso: ele esta com o celular no bolso, a tela acende com a
 * oferta, e ele resolve num toque. Abrir o aplicativo para aceitar gastaria
 * parte do prazo justamente quando ele esta na rua.
 *
 * Nao abre nenhuma tela de proposito. A partir do Android 12 e proibido um
 * `BroadcastReceiver` de notificacao iniciar Activity — e, mais importante,
 * abrir o aplicativo seria exatamente o que este botao existe para evitar.
 */
class OfferActionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val acao = intent.action ?: return
    val offerId = intent.getStringExtra(EXTRA_OFFER_ID) ?: return
    if (acao != ACTION_ACCEPT && acao != ACTION_DECLINE) return

    /**
     * `goAsync` porque `onReceive` roda na thread principal e morre ao
     * retornar. Sem isso a chamada HTTP seria cortada no meio e o motoboy
     * ficaria achando que respondeu.
     */
    val pendente = goAsync()
    val appContext = context.applicationContext

    Thread {
      try {
        val resultado = OfferNativeClient.respond(appContext, acao, offerId)
        if (
          resultado == OfferNativeClient.ActionResult.ACCEPTED ||
            resultado == OfferNativeClient.ActionResult.DECLINED ||
            resultado == OfferNativeClient.ActionResult.UNAVAILABLE
        ) {
          // So remove depois de a API confirmar. Numa falha de rede, a oferta
          // continua acionavel para o motoboy tentar de novo dentro do prazo.
          cancelarNotificacaoDaOferta(appContext)
          OfferSessionStore.marcarOfertaResolvida(appContext, offerId)
          OfferActivity.notifyResolved(appContext, offerId)
        }
        avisar(appContext, resultado)
      } finally {
        pendente.finish()
      }
    }
      .start()
  }

  /**
   * O motoboy PRECISA saber o que aconteceu.
   *
   * Silencio depois do toque seria pior que nao ter o botao: ele acharia que
   * aceitou, guardaria o celular, e a corrida iria para outro.
   */
  private fun avisar(context: Context, resultado: OfferNativeClient.ActionResult) {
    val texto =
      when (resultado) {
        OfferNativeClient.ActionResult.ACCEPTED ->
          "Entrega aceita. Abra o aplicativo para ver a coleta."
        OfferNativeClient.ActionResult.DECLINED -> "Entrega recusada."
        OfferNativeClient.ActionResult.UNAVAILABLE -> "Esta entrega nao esta mais disponivel."
        OfferNativeClient.ActionResult.NO_SESSION ->
          "Entre no aplicativo para responder a esta entrega."
        OfferNativeClient.ActionResult.FAILURE ->
          "Nao foi possivel responder. Abra o aplicativo e tente de novo."
      }

    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val notificacao =
      NotificationCompat.Builder(context, "avisos")
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("MOTOboyCity")
        .setContentText(texto)
        .setAutoCancel(true)
        .build()
    manager.notify(RESULTADO_NOTIFICATION_ID, notificacao)
  }

  private fun cancelarNotificacaoDaOferta(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.cancel(OFFER_NOTIFICATION_ID)
  }

  companion object {
    const val ACTION_ACCEPT = "com.motoboycity.driverapp.OFERTA_ACEITAR"
    const val ACTION_DECLINE = "com.motoboycity.driverapp.OFERTA_RECUSAR"
    const val EXTRA_OFFER_ID = "offerId"

    /**
     * Id fixo da notificacao de oferta, declarado UMA vez.
     *
     * Fixo porque uma oferta nova substitui a anterior na bandeja em vez de
     * empilhar — so existe uma esperando resposta por vez. Declarado aqui e
     * lido pelo `OfferMessagingService` porque os dois precisam concordar: se
     * cada um tivesse o seu, o receiver cancelaria uma notificacao que nao e a
     * que esta na tela.
     */
    const val OFFER_NOTIFICATION_ID = 1001
    private const val RESULTADO_NOTIFICATION_ID = 1002

  }
}
