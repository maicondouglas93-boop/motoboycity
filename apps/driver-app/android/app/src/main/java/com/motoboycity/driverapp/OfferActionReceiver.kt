package com.motoboycity.driverapp

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

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
        // Some da bandeja na hora: a oferta tem prazo, e deixar o cartao la
        // convidaria a um segundo toque que so traria conflito.
        cancelarNotificacaoDaOferta(appContext)
        val resultado = responder(appContext, acao, offerId)
        avisar(appContext, resultado)
      } finally {
        pendente.finish()
      }
    }
      .start()
  }

  private fun responder(context: Context, acao: String, offerId: String): Resultado {
    val apiUrl = OfferSessionStore.apiUrl(context)
    val token = OfferSessionStore.accessToken(context)
    if (apiUrl.isNullOrBlank() || token.isNullOrBlank()) {
      return Resultado.SEM_SESSAO
    }

    val caminho = if (acao == ACTION_ACCEPT) "accept" else "decline"
    val requisicao =
      Request.Builder()
        .url("$apiUrl/delivery-offers/$offerId/$caminho")
        // PATCH e o motivo de usar OkHttp: `HttpURLConnection` do Android
        // recusa esse metodo.
        .patch(ByteArray(0).toRequestBody(null))
        .header("Authorization", "Bearer $token")
        .build()

    return try {
      cliente.newCall(requisicao).execute().use { resposta ->
        when {
          resposta.isSuccessful ->
            if (acao == ACTION_ACCEPT) Resultado.ACEITA else Resultado.RECUSADA
          // 409: outro motoboy pegou, ou o prazo acabou entre o toque e a
          // chegada da requisicao.
          resposta.code == 409 || resposta.code == 404 -> Resultado.INDISPONIVEL
          else -> Resultado.FALHA
        }
      }
    } catch (erro: Exception) {
      Resultado.FALHA
    }
  }

  /**
   * O motoboy PRECISA saber o que aconteceu.
   *
   * Silencio depois do toque seria pior que nao ter o botao: ele acharia que
   * aceitou, guardaria o celular, e a corrida iria para outro.
   */
  private fun avisar(context: Context, resultado: Resultado) {
    val texto =
      when (resultado) {
        Resultado.ACEITA -> "Entrega aceita. Abra o aplicativo para ver a coleta."
        Resultado.RECUSADA -> "Entrega recusada."
        Resultado.INDISPONIVEL -> "Esta entrega nao esta mais disponivel."
        Resultado.SEM_SESSAO -> "Entre no aplicativo para responder a esta entrega."
        Resultado.FALHA -> "Nao foi possivel responder. Abra o aplicativo e tente de novo."
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

  private enum class Resultado {
    ACEITA,
    RECUSADA,
    INDISPONIVEL,
    SEM_SESSAO,
    FALHA,
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

    /**
     * Prazos curtos: o motoboy esta esperando na tela de bloqueio. Uma
     * requisicao que demora dez segundos e indistinguivel de uma que falhou, e
     * pior — ele acha que respondeu.
     */
    private val cliente =
      OkHttpClient.Builder()
        .connectTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
        .build()
  }
}
