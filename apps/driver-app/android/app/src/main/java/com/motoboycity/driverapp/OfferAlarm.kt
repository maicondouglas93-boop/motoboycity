package com.motoboycity.driverapp

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * O toque que insiste enquanto a oferta esta na tela.
 *
 * O som do CANAL de notificacao toca uma vez e acaba — bom para um aviso, ruim
 * para uma oferta com cronometro de segundos. Um motoboy com o celular no bolso
 * e o capacete na cabeca nao ouve um bipe curto, e a oferta expira sozinha. Foi
 * o que aconteceu no teste do pedido #1174.
 *
 * Entao aqui e toque de CHAMADA em laco, junto com vibracao repetida, do jeito
 * que um telefone chamando insiste ate alguem atender.
 *
 * O toque para quando a tela de oferta sai, seja por aceitar, recusar ou o
 * prazo acabar. Nao existe caminho em que ele continue tocando sem a oferta na
 * frente: `parar()` e chamado no `onDestroy` da Activity, que roda mesmo se o
 * processo for derrubado pelo sistema.
 */
class OfferAlarm(private val context: Context) {
  private var player: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private val audioManager = context.getSystemService(AudioManager::class.java)

  /**
   * Vibra em pulsos longos com pausa curta, repetindo. O indice 0 no
   * `createWaveform` manda voltar ao inicio do padrao — e o que torna a
   * vibracao continua em vez de um tremor unico.
   */
  private val padraoDeVibracao = longArrayOf(0, 700, 400)

  fun tocar() {
    if (player != null) return

    pedirFocoDeAudio()
    iniciarToque()
    iniciarVibracao()
  }

  fun parar() {
    player?.let { atual ->
      runCatching {
        if (atual.isPlaying) atual.stop()
        atual.release()
      }
    }
    player = null

    runCatching { vibrador()?.cancel() }
    devolverFocoDeAudio()
  }

  private fun iniciarToque() {
    /**
     * Toque de CHAMADA, e nao de notificacao: e mais longo, mais alto e o
     * motoboy ja reconhece como "alguem quer voce agora".
     *
     * O fallback existe porque em alguns aparelhos o toque padrao pode estar
     * como "nenhum"; ai a vibracao ainda cumpre o papel.
     */
    val uri =
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        ?: return

    runCatching {
      MediaPlayer().apply {
        /**
         * Os atributos vem ANTES do `setDataSource`.
         *
         * Invertida, a ordem falha em silencio: o player nasce com
         * `USAGE_UNKNOWN` e toca no volume de MIDIA em vez do volume de TOQUE.
         * Na pratica isso significa uma oferta que nao toca porque o motoboy
         * deixou a midia baixa — e nada no log parece erro.
         */
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(context, uri)
        isLooping = true
        prepare()
        start()
        player = this
      }
    }.onFailure { erro ->
      Log.w(TAG, "Nao foi possivel tocar o alerta da oferta.", erro)
    }
  }

  private fun iniciarVibracao() {
    val vibrador = vibrador() ?: return
    runCatching {
      vibrador.vibrate(VibrationEffect.createWaveform(padraoDeVibracao, 0))
    }
  }

  private fun vibrador(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Vibrator::class.java)
    }

  /**
   * Foco TRANSIENT: abaixa o volume do que estiver tocando (musica, navegacao)
   * em vez de cortar, e devolve no fim. O motoboy costuma estar com o GPS
   * falando, e perder a instrucao da rota para ouvir a oferta seria trocar um
   * problema por outro.
   */
  private fun pedirFocoDeAudio() {
    val manager = audioManager ?: return
    val atributos =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    val pedido =
      AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(atributos)
        .build()

    runCatching { manager.requestAudioFocus(pedido) }
    focusRequest = pedido
  }

  private fun devolverFocoDeAudio() {
    val manager = audioManager ?: return
    focusRequest?.let { pedido -> runCatching { manager.abandonAudioFocusRequest(pedido) } }
    focusRequest = null
  }

  private companion object {
    const val TAG = "OfferAlarm"
  }
}

/**
 * Alarme compartilhado pela tela React Native da oferta.
 *
 * A Activity nativa possui seu proprio alarme porque o Android controla o
 * ciclo dela. Com o aplicativo aberto, a oferta vive na navegacao React Native
 * e precisa atravessar a ponte. Manter uma unica instancia por processo torna
 * iniciar/parar idempotente e impede dois toques concorrentes para a mesma
 * oferta.
 */
object ForegroundOfferAlarm {
  private var alarm: OfferAlarm? = null
  private var activeOfferId: String? = null

  @Synchronized
  fun start(context: Context, offerId: String) {
    if (activeOfferId != null && activeOfferId != offerId) {
      alarm?.parar()
      alarm = null
    }
    activeOfferId = offerId
    val current = alarm ?: OfferAlarm(context.applicationContext).also { alarm = it }
    current.tocar()
  }

  @Synchronized
  fun stop(offerId: String? = null) {
    if (offerId != null && activeOfferId != offerId) return
    alarm?.parar()
    alarm = null
    activeOfferId = null
  }
}
