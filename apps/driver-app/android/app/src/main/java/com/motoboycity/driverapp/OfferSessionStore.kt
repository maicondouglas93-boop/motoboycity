package com.motoboycity.driverapp

import android.content.Context

/**
 * Onde o codigo NATIVO acha a sessao do motoboy.
 *
 * Os botoes de aceitar e recusar vivem na notificacao, e quem responde a eles e
 * um `BroadcastReceiver` — nao o JavaScript. A sessao, porem, e guardada pelo
 * JavaScript no AsyncStorage, que o lado nativo nao le. Entao o aplicativo
 * espelha aqui a URL da API e o token, e o receiver busca deste espelho.
 *
 * Fica em `SharedPreferences` privado do aplicativo, que e a mesma protecao do
 * AsyncStorage: arquivo no diretorio privado, ilegivel por outros aplicativos
 * em aparelho sem root. Nao ha token novo exposto — e o mesmo que ja estava no
 * aparelho, agora tambem alcancavel de onde precisa ser usado.
 */
object OfferSessionStore {
  private const val ARQUIVO = "motoboycity.offer.session"
  private const val CHAVE_URL = "apiUrl"
  private const val CHAVE_TOKEN = "accessToken"
  private const val CHAVE_OFERTA_ATUAL = "currentOfferId"
  private const val CHAVE_ENTREGA_ATUAL = "currentDeliveryId"
  private const val CHAVE_OFERTA_EXPIRA_EM = "currentOfferExpiresAtEpochMs"
  private const val CHAVE_OFERTA_RESOLVIDA = "resolvedOfferId"
  private const val CHAVE_OFERTA_RESOLVIDA_EM = "resolvedOfferAt"
  private const val JANELA_DEDUPLICACAO_MS = 5 * 60 * 1000L

  fun salvar(context: Context, apiUrl: String, accessToken: String) {
    prefs(context).edit().putString(CHAVE_URL, apiUrl).putString(CHAVE_TOKEN, accessToken).apply()
  }

  fun limpar(context: Context) {
    prefs(context).edit().clear().apply()
  }

  fun apiUrl(context: Context): String? = prefs(context).getString(CHAVE_URL, null)

  fun accessToken(context: Context): String? = prefs(context).getString(CHAVE_TOKEN, null)

  fun marcarOfertaApresentada(
    context: Context,
    offerId: String,
    deliveryId: String? = null,
    expiresAtEpochMs: Long? = null,
  ) {
    val editor = prefs(context).edit().putString(CHAVE_OFERTA_ATUAL, offerId)
    if (deliveryId.isNullOrBlank()) {
      editor.remove(CHAVE_ENTREGA_ATUAL)
    } else {
      editor.putString(CHAVE_ENTREGA_ATUAL, deliveryId)
    }
    if (expiresAtEpochMs == null || expiresAtEpochMs <= 0L) {
      editor.remove(CHAVE_OFERTA_EXPIRA_EM)
    } else {
      editor.putLong(CHAVE_OFERTA_EXPIRA_EM, expiresAtEpochMs)
    }
    editor.apply()
  }

  fun ofertaAtual(context: Context): String? =
    prefs(context).getString(CHAVE_OFERTA_ATUAL, null)

  fun entregaDaOferta(context: Context, offerId: String): String? {
    val preferencias = prefs(context)
    if (preferencias.getString(CHAVE_OFERTA_ATUAL, null) != offerId) return null
    return preferencias.getString(CHAVE_ENTREGA_ATUAL, null)
  }

  fun ofertaPodeSerRespondida(
    context: Context,
    offerId: String,
    agoraEpochMs: Long = System.currentTimeMillis(),
  ): Boolean {
    val preferencias = prefs(context)
    if (preferencias.getString(CHAVE_OFERTA_ATUAL, null) != offerId) return false
    val expiraEm = preferencias.getLong(CHAVE_OFERTA_EXPIRA_EM, 0L)
    return expiraEm <= 0L || agoraEpochMs < expiraEm
  }

  /**
   * Impede que um push atrasado reabra uma oferta que o motoboy acabou de
   * aceitar, recusar ou ver expirar na tela JavaScript/nativa.
   *
   * O FCM pode entregar duas cópias muito próximas durante reconexão. A
   * autoridade continua sendo a API; esta janela curta é apenas deduplicação
   * visual no aparelho.
   */
  fun marcarOfertaResolvida(context: Context, offerId: String) {
    val preferencias = prefs(context)
    val editor = preferencias
      .edit()
      .putString(CHAVE_OFERTA_RESOLVIDA, offerId)
      .putLong(CHAVE_OFERTA_RESOLVIDA_EM, System.currentTimeMillis())

    if (preferencias.getString(CHAVE_OFERTA_ATUAL, null) == offerId) {
      editor.remove(CHAVE_OFERTA_ATUAL)
      editor.remove(CHAVE_ENTREGA_ATUAL)
      editor.remove(CHAVE_OFERTA_EXPIRA_EM)
    }

    editor.apply()
  }

  fun ofertaFoiResolvidaRecentemente(context: Context, offerId: String): Boolean {
    val preferencias = prefs(context)
    if (preferencias.getString(CHAVE_OFERTA_RESOLVIDA, null) != offerId) return false
    val resolvidaEm = preferencias.getLong(CHAVE_OFERTA_RESOLVIDA_EM, 0L)
    return System.currentTimeMillis() - resolvidaEm in 0..JANELA_DEDUPLICACAO_MS
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)
}
