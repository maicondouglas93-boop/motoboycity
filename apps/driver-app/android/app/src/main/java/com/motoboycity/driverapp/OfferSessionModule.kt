package com.motoboycity.driverapp

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Espelha a sessao do motoboy para o lado nativo.
 *
 * Os botoes de aceitar e recusar na notificacao sao respondidos por um
 * `BroadcastReceiver`, que nao tem como ler o AsyncStorage do JavaScript. Este
 * modulo e a ponte: o aplicativo grava URL e token quando entra, e limpa quando
 * sai.
 */
class OfferSessionModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OfferSession"

  @ReactMethod
  fun save(apiUrl: String, accessToken: String, promise: Promise) {
    OfferSessionStore.salvar(reactContext, apiUrl, accessToken)
    promise.resolve(null)
  }

  /**
   * Limpar ao sair e obrigatorio, nao higiene.
   *
   * Um token esquecido aqui deixaria os botoes respondendo ofertas em nome de
   * quem ja saiu da conta — no mesmo aparelho que outro motoboy pode estar
   * usando agora.
   */
  @ReactMethod
  fun clear(promise: Promise) {
    OfferSessionStore.limpar(reactContext)
    promise.resolve(null)
  }
}
