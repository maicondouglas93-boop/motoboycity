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

  fun salvar(context: Context, apiUrl: String, accessToken: String) {
    prefs(context).edit().putString(CHAVE_URL, apiUrl).putString(CHAVE_TOKEN, accessToken).apply()
  }

  fun limpar(context: Context) {
    prefs(context).edit().clear().apply()
  }

  fun apiUrl(context: Context): String? = prefs(context).getString(CHAVE_URL, null)

  fun accessToken(context: Context): String? = prefs(context).getString(CHAVE_TOKEN, null)

  private fun prefs(context: Context) =
    context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)
}
