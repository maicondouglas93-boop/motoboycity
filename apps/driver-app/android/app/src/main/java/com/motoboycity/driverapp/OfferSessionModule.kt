package com.motoboycity.driverapp

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
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

  /** Fecha a faixa/cartão nativos quando a resposta aconteceu no React Native. */
  @ReactMethod
  fun dismiss(offerId: String, promise: Promise) {
    OfferSessionStore.marcarOfertaResolvida(reactContext, offerId)
    reactContext
      .getSystemService(NotificationManager::class.java)
      ?.cancel(OfferActionReceiver.OFFER_NOTIFICATION_ID)
    OfferActivity.notifyResolved(reactContext, offerId)
    promise.resolve(null)
  }

  /** Estado exibido em Ajustes; nenhuma permissão é presumida pela interface. */
  @ReactMethod
  fun presentationStatus(promise: Promise) {
    val manager = reactContext.getSystemService(NotificationManager::class.java)
    val offerChannelEnabled =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val importance = manager?.getNotificationChannel("ofertas")?.importance
        importance != null && importance >= NotificationManager.IMPORTANCE_HIGH
      } else {
        true
      }
    val fullScreenGranted =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        manager?.canUseFullScreenIntent() == true
      } else {
        true
      }
    val result = Arguments.createMap()
    result.putBoolean(
      "notificationsEnabled",
      NotificationManagerCompat.from(reactContext).areNotificationsEnabled() && offerChannelEnabled,
    )
    result.putBoolean("fullScreenGranted", fullScreenGranted)
    result.putBoolean(
      "fullScreenNeedsManualGrant",
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE,
    )
    promise.resolve(result)
  }

  /**
   * Android 14+ exige acesso especial para abrir sobre a tela bloqueada.
   * Quando ele não existe, a oferta continua como heads-up e abre ao toque.
   */
  @ReactMethod
  fun openFullScreenSettings(promise: Promise) {
    val packageUri = Uri.parse("package:${reactContext.packageName}")
    val primary =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
      }
    primary.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactContext.startActivity(primary)
      promise.resolve(null)
    } catch (_: Exception) {
      val fallback =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri).addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK,
        )
      reactContext.startActivity(fallback)
      promise.resolve(null)
    }
  }
}
