package com.motoboycity.driverapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(LocationTrackingPackage())
          add(OfferSessionPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    criarCanaisDeNotificacao()
  }

  /**
   * Canais de notificacao do Android.
   *
   * Precisam existir ANTES da primeira notificacao chegar: a partir do Android
   * 8, uma notificacao com canal inexistente e descartada em silencio — o que
   * seria o mesmo que nao ter push.
   *
   * Criar aqui, e nao com uma biblioteca a mais, porque criacao de canal e
   * exatamente uma tarefa de inicializacao nativa. Chamar de novo nao duplica:
   * `createNotificationChannel` e idempotente pelo id.
   */
  private fun criarCanaisDeNotificacao() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NotificationManager::class.java) ?: return

    /**
     * Oferta em importancia MAXIMA: aparece sobre a tela e toca.
     *
     * O motoboy tem prazo para responder, e uma oferta entregue em silencio
     * expira sozinha. E o unico canal que justifica esse nivel de intrusao.
     */
    val ofertas =
      NotificationChannel("ofertas", "Ofertas de entrega", NotificationManager.IMPORTANCE_HIGH)
    ofertas.description = "Avisa quando uma entrega e oferecida a voce."
    ofertas.enableVibration(true)
    ofertas.setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
      AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .build(),
    )

    /** O resto: conta, rastreamento, repasse. Nao interrompe o que ele faz. */
    val avisos =
      NotificationChannel("avisos", "Avisos", NotificationManager.IMPORTANCE_DEFAULT)
    avisos.description = "Avisos sobre sua conta, rastreamento e pagamentos."

    manager.createNotificationChannel(ofertas)
    manager.createNotificationChannel(avisos)
  }
}
