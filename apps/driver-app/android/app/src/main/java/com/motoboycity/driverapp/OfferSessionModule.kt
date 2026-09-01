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
    ForegroundOfferAlarm.stop()
    OfferSessionStore.limpar(reactContext)
    promise.resolve(null)
  }

  /** Liga o mesmo toque insistente quando a oferta esta na tela React Native. */
  @ReactMethod
  fun startOfferAlarm(offerId: String, promise: Promise) {
    ForegroundOfferAlarm.start(reactContext, offerId)
    promise.resolve(null)
  }

  /** Para o toque ao responder, expirar ou sair da tela React Native. */
  @ReactMethod
  fun stopOfferAlarm(offerId: String, promise: Promise) {
    ForegroundOfferAlarm.stop(offerId)
    promise.resolve(null)
  }

  /** Fecha a faixa/cartão nativos quando a resposta aconteceu no React Native. */
  @ReactMethod
  fun dismiss(offerId: String, promise: Promise) {
    ForegroundOfferAlarm.stop(offerId)
    OfferSessionStore.marcarOfertaResolvida(reactContext, offerId)
    reactContext
      .getSystemService(NotificationManager::class.java)
      ?.cancel(OfferActionReceiver.OFFER_NOTIFICATION_ID)
    OfferActivity.notifyResolved(reactContext, offerId)
    promise.resolve(null)
  }

  override fun invalidate() {
    ForegroundOfferAlarm.stop()
    super.invalidate()
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
    val overlayGranted =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(reactContext)
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
    result.putBoolean("overlayGranted", overlayGranted)
    result.putBoolean(
      "overlayNeedsManualGrant",
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.M,
    )
    promise.resolve(result)
  }

  /**
   * Abre o acesso especial usado para mostrar a oferta completa com o aparelho
   * desbloqueado. Android 13+ transforma full-screen intent em heads-up durante
   * o uso normal do aparelho; SYSTEM_ALERT_WINDOW e uma escolha explicita do
   * motoboy e mantem a notificacao comum como fallback quando estiver negada.
   */
  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    val packageUri = Uri.parse("package:${reactContext.packageName}")
    val primary =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri)
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
