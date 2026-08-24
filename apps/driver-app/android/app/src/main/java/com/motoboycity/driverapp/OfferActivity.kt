package com.motoboycity.driverapp

import android.app.Activity
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.NumberFormat
import java.util.Locale

/**
 * Cartão Android da oferta quando o React Native está suspenso.
 *
 * A Activity é translúcida: sobre a Home do aparelho, outro aplicativo ou a
 * tela bloqueada, o contexto continua visível atrás da cortina, como nas
 * referências. Nenhum endereço viaja no FCM; a tela busca a oferta pendente na
 * API autenticada antes de renderizar.
 */
class OfferActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var currentOfferId: String? = null
  private var deadlineMs = 0L
  private var timerView: TextView? = null
  private var buttons: List<View> = emptyList()

  private val closeReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        val resolvedId = intent?.getStringExtra(EXTRA_OFFER_ID) ?: return
        if (resolvedId == currentOfferId) finish()
      }
    }

  private val timer =
    object : Runnable {
      override fun run() {
        val remaining = ((deadlineMs - System.currentTimeMillis() + 999) / 1000).coerceAtLeast(0)
        timerView?.text = formatTimer(remaining.toInt())
        if (remaining <= 0) {
          currentOfferId?.let {
            OfferSessionStore.marcarOfertaResolvida(this@OfferActivity, it)
            cancelOfferNotification()
          }
          finish()
          return
        }
        handler.postDelayed(this, 1000)
      }
    }

  /** Fecha tambem as telas de erro/carregamento quando o prazo absoluto acaba. */
  private val loadDeadlineGuard =
    object : Runnable {
      override fun run() {
        val remainingMs = deadlineMs - System.currentTimeMillis()
        if (deadlineMs <= 0L) return
        if (remainingMs <= 0L) {
          currentOfferId?.let {
            OfferSessionStore.marcarOfertaResolvida(this@OfferActivity, it)
            cancelOfferNotification()
          }
          finish()
          return
        }
        handler.postDelayed(this, remainingMs.coerceAtMost(1_000L))
      }
    }

  /**
   * O toque insistente da oferta. Vive junto da tela: comeca quando ela
   * aparece e para quando ela sai, seja por resposta ou por prazo vencido.
   */
  private val alarme by lazy { OfferAlarm(this) }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureWindow()
    registerCloseReceiver()
    load(intent)
    alarme.tocar()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    load(intent)
  }

  override fun onDestroy() {
    alarme.parar()
    handler.removeCallbacks(timer)
    handler.removeCallbacks(loadDeadlineGuard)
    runCatching { unregisterReceiver(closeReceiver) }
    super.onDestroy()
  }

  private fun configureWindow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_DIM_BEHIND,
    )
    window.attributes = window.attributes.apply { dimAmount = 0.58f }
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
  }

  private fun registerCloseReceiver() {
    val filter = IntentFilter(ACTION_OFFER_RESOLVED)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(closeReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(closeReceiver, filter)
    }
  }

  private fun load(intent: Intent) {
    handler.removeCallbacks(timer)
    handler.removeCallbacks(loadDeadlineGuard)
    val offerId = intent.getStringExtra(EXTRA_OFFER_ID)
    if (offerId.isNullOrBlank()) {
      finish()
      return
    }
    currentOfferId = offerId
    deadlineMs = intent.getLongExtra(EXTRA_EXPIRES_AT_EPOCH_MS, 0L)
    if (deadlineMs > 0L) handler.post(loadDeadlineGuard)
    showLoading()

    Thread {
        val result = OfferNativeClient.fetchPending(applicationContext, offerId)
        runOnUiThread {
          if (isFinishing || currentOfferId != offerId) return@runOnUiThread
          when (result) {
            is OfferNativeClient.FetchResult.Success -> showOffer(result.offer)
            OfferNativeClient.FetchResult.Unavailable -> closeWithMessage("Esta oferta não está mais disponível.")
            OfferNativeClient.FetchResult.NoSession -> showSessionRequired(offerId)
            OfferNativeClient.FetchResult.Failure -> showLoadFailure(offerId)
          }
        }
      }
      .start()
  }

  private fun showLoading() {
    val card = cardContainer()
    card.addView(brand())
    card.addView(
      ProgressBar(this).apply {
        isIndeterminate = true
        layoutParams =
          LinearLayout.LayoutParams(dp(42), dp(42)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = dp(28)
          }
      },
    )
    card.addView(
      text("Carregando detalhes da oferta…", 15f, INK_SOFT, Typeface.BOLD).apply {
        gravity = Gravity.CENTER
        setPadding(dp(20), dp(16), dp(20), dp(28))
      },
    )
    setContentView(rootWithCard(card))
  }

  private fun showOffer(offer: NativeOfferPresentation) {
    handler.removeCallbacks(loadDeadlineGuard)
    currentOfferId = offer.offerId
    deadlineMs = System.currentTimeMillis() + offer.expiresInSeconds * 1000L
    val card = cardContainer()
    card.addView(brand())
    card.addView(summary(offer))
    card.addView(companyRow(offer))
    card.addView(divider())

    val stopsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    offer.stops.forEachIndexed { index, stop ->
      stopsContainer.addView(stopRow(stop, index < offer.stops.lastIndex))
    }
    card.addView(
      ScrollView(this).apply {
        isFillViewport = false
        isVerticalScrollBarEnabled = offer.stops.size > 3
        addView(stopsContainer)
        layoutParams =
          LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            if (offer.stops.size > 3) dp(286) else ViewGroup.LayoutParams.WRAP_CONTENT,
          )
      },
    )

    card.addView(divider())
    card.addView(paymentPill(offer))
    card.addView(actionButtons(offer.offerId))
    setContentView(rootWithCard(card))
    handler.post(timer)
  }

  private fun summary(offer: NativeOfferPresentation): View {
    val row = horizontal().apply {
      gravity = Gravity.TOP
      setPadding(dp(20), dp(8), dp(20), dp(6))
    }
    val valueText =
      if (offer.driverValue == null) {
        text(
          "O valor será calculado\nconforme as entregas",
          15f,
          DANGER,
          Typeface.BOLD,
        )
      } else {
        text("Você recebe\n${currency(offer.driverValue)}", 15f, SUCCESS, Typeface.BOLD)
      }
    row.addView(valueText, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

    val quantity = horizontal().apply { gravity = Gravity.CENTER_VERTICAL }
    quantity.addView(OfferIconView(this, "pin", LINK), LinearLayout.LayoutParams(dp(27), dp(34)))
    quantity.addView(
      text(
        "${offer.deliveryCount} ${if (offer.deliveryCount == 1) "entrega" else "entregas"}",
        20f,
        INK,
        Typeface.BOLD,
      ).apply { setPadding(dp(6), 0, 0, 0) },
    )
    row.addView(quantity)
    return row
  }

  private fun companyRow(offer: NativeOfferPresentation): View {
    val row = horizontal().apply {
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(20), dp(8), dp(20), dp(12))
    }
    row.addView(OfferIconView(this, "person", INK), LinearLayout.LayoutParams(dp(27), dp(27)))
    row.addView(
      text(offer.companyName, 19f, INK, Typeface.BOLD).apply {
        maxLines = 1
        setPadding(dp(10), 0, dp(8), 0)
      },
      LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
    )
    timerView = text(formatTimer(offer.expiresInSeconds), 16f, INK_SOFT, Typeface.BOLD)
    row.addView(timerView)
    return row
  }

  private fun stopRow(stop: NativeOfferStop, connector: Boolean): View {
    val row = horizontal().apply {
      gravity = Gravity.TOP
      setPadding(dp(18), dp(12), dp(18), dp(8))
    }
    val iconColumn = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    iconColumn.addView(
      OfferIconView(this, stop.kind, INK),
      LinearLayout.LayoutParams(dp(30), dp(34)),
    )
    if (connector) {
      iconColumn.addView(
        View(this).apply { setBackgroundColor(DIVIDER_DARK) },
        LinearLayout.LayoutParams(dp(1), dp(22)).apply { topMargin = dp(3) },
      )
    }
    row.addView(iconColumn, LinearLayout.LayoutParams(dp(42), ViewGroup.LayoutParams.WRAP_CONTENT))

    val copy = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(8), 0, 0, dp(4))
    }
    copy.addView(text(stop.label, 17f, INK_SOFT, Typeface.BOLD))
    copy.addView(
      text(stop.address, 14f, INK, Typeface.NORMAL).apply {
        setLineSpacing(0f, 1.2f)
        setPadding(0, dp(3), 0, 0)
      },
    )
    row.addView(copy, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    return row
  }

  private fun paymentPill(offer: NativeOfferPresentation): View {
    val label =
      buildString {
        append(offer.paymentMethod)
        offer.distanceKm?.let { append(" · ${String.format(Locale("pt", "BR"), "%.1f km", it)}") }
      }
    return text(label, 14f, INK_SOFT, Typeface.BOLD).apply {
      background = rounded(Color.WHITE, dp(18).toFloat(), DIVIDER, 1)
      setPadding(dp(13), dp(6), dp(13), dp(6))
      layoutParams =
        LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.WRAP_CONTENT,
          ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
          marginStart = dp(20)
          topMargin = dp(10)
        }
    }
  }

  private fun actionButtons(offerId: String): View {
    val row = horizontal().apply {
      gravity = Gravity.CENTER
      setPadding(dp(28), dp(14), dp(28), dp(20))
    }
    val decline = actionButton("close", DANGER) { respond(OfferActionReceiver.ACTION_DECLINE, offerId) }
    val accept = actionButton("check", SUCCESS) { respond(OfferActionReceiver.ACTION_ACCEPT, offerId) }
    buttons = listOf(decline, accept)
    row.addView(decline, LinearLayout.LayoutParams(dp(76), dp(76)).apply { marginEnd = dp(46) })
    row.addView(accept, LinearLayout.LayoutParams(dp(76), dp(76)).apply { marginStart = dp(46) })
    return row
  }

  private fun actionButton(icon: String, color: Int, onClick: () -> Unit): View =
    FrameLayout(this).apply {
      background = rounded(color, dp(38).toFloat())
      elevation = dp(5).toFloat()
      isClickable = true
      isFocusable = true
      contentDescription = if (icon == "check") "Aceitar oferta" else "Recusar oferta"
      addView(
        OfferIconView(this@OfferActivity, icon, Color.WHITE),
        FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER),
      )
      setOnClickListener { onClick() }
    }

  private fun respond(action: String, offerId: String) {
    // O toque existe para chamar a atencao. Ela ja foi chamada: quem tocou o
    // botao esta olhando a tela, e continuar tocando durante o envio so irrita.
    alarme.parar()
    buttons.forEach { it.isEnabled = false; it.alpha = 0.55f }
    timerView?.text = "Enviando…"
    Thread {
        val result = OfferNativeClient.respond(applicationContext, action, offerId)
        runOnUiThread {
          if (isFinishing) return@runOnUiThread
          when (result) {
            OfferNativeClient.ActionResult.ACCEPTED -> closeResolved(offerId, "Entrega aceita.")
            OfferNativeClient.ActionResult.DECLINED -> closeResolved(offerId, "Entrega recusada.")
            OfferNativeClient.ActionResult.UNAVAILABLE ->
              closeResolved(offerId, "Esta oferta não está mais disponível.")
            OfferNativeClient.ActionResult.NO_SESSION -> showSessionRequired(offerId)
            OfferNativeClient.ActionResult.FAILURE -> {
              buttons.forEach { it.isEnabled = true; it.alpha = 1f }
              handler.post(timer)
              // Nao foi enviado e o prazo continua correndo: volta a insistir.
              alarme.tocar()
              Toast.makeText(
                  this,
                  "Não foi possível responder. Verifique a internet e tente novamente.",
                  Toast.LENGTH_LONG,
                )
                .show()
            }
          }
        }
      }
      .start()
  }

  private fun closeResolved(offerId: String, message: String) {
    OfferSessionStore.marcarOfertaResolvida(this, offerId)
    cancelOfferNotification()
    notifyResolved(this, offerId)
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    finish()
  }

  private fun showSessionRequired(offerId: String) {
    showMessageCard(
      title = "Entre novamente",
      message = "Sua sessão não está disponível no Android. Abra o aplicativo para entrar e consultar a oferta.",
      buttonLabel = "Abrir aplicativo",
    ) {
      startActivity(
        Intent(this, MainActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          putExtra("abrirOferta", true)
          putExtra(EXTRA_OFFER_ID, offerId)
        },
      )
      finish()
    }
  }

  private fun showLoadFailure(offerId: String) {
    showMessageCard(
      title = "Não foi possível carregar",
      message = "Verifique a internet. O prazo da oferta continua correndo.",
      buttonLabel = "Tentar novamente",
    ) { load(Intent(intent).putExtra(EXTRA_OFFER_ID, offerId)) }
  }

  private fun showMessageCard(
    title: String,
    message: String,
    buttonLabel: String,
    onClick: () -> Unit,
  ) {
    val card = cardContainer()
    card.addView(brand())
    card.addView(text(title, 21f, INK, Typeface.BOLD).apply { gravity = Gravity.CENTER; setPadding(dp(20), dp(24), dp(20), dp(6)) })
    card.addView(text(message, 14f, INK_SOFT, Typeface.NORMAL).apply { gravity = Gravity.CENTER; setPadding(dp(24), 0, dp(24), dp(20)) })
    card.addView(
      text(buttonLabel, 15f, Color.WHITE, Typeface.BOLD).apply {
        gravity = Gravity.CENTER
        background = rounded(ACTION, dp(12).toFloat())
        setPadding(dp(22), dp(14), dp(22), dp(14))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(20), 0, dp(20), dp(20)) }
        setOnClickListener { onClick() }
      },
    )
    setContentView(rootWithCard(card))
  }

  private fun closeWithMessage(message: String) {
    currentOfferId?.let { OfferSessionStore.marcarOfertaResolvida(this, it) }
    cancelOfferNotification()
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    finish()
  }

  private fun rootWithCard(card: View): View =
    FrameLayout(this).apply {
      setBackgroundColor(Color.TRANSPARENT)
      addView(
        card,
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
          marginStart = dp(18)
          marginEnd = dp(18)
          topMargin = dp(18)
          bottomMargin = dp(18)
        },
      )
    }

  private fun cardContainer() =
    LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = rounded(SURFACE, dp(20).toFloat())
      elevation = dp(18).toFloat()
      clipToOutline = true
    }

  private fun brand(): TextView {
    val value = SpannableString("MOTOboyCity")
    value.setSpan(ForegroundColorSpan(INK), 0, 4, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    value.setSpan(ForegroundColorSpan(BRAND), 4, value.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return text(value, 24f, INK, Typeface.BOLD).apply {
      gravity = Gravity.CENTER
      setPadding(dp(16), dp(17), dp(16), dp(8))
    }
  }

  private fun divider() = View(this).apply {
    setBackgroundColor(DIVIDER)
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
  }

  private fun horizontal() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

  private fun text(value: CharSequence, size: Float, color: Int, style: Int) =
    TextView(this).apply {
      text = value
      textSize = size
      setTextColor(color)
      typeface = Typeface.create(Typeface.DEFAULT, style)
    }

  private fun rounded(color: Int, radius: Float, strokeColor: Int? = null, strokeWidth: Int = 0) =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
      cornerRadius = radius
      if (strokeColor != null && strokeWidth > 0) setStroke(dp(strokeWidth), strokeColor)
    }

  private fun cancelOfferNotification() {
    getSystemService(NotificationManager::class.java)?.cancel(OfferActionReceiver.OFFER_NOTIFICATION_ID)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun currency(value: Double): String =
    NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)

  companion object {
    const val EXTRA_OFFER_ID = "offerId"
    const val EXTRA_EXPIRES_AT_EPOCH_MS = "expiresAtEpochMs"
    private const val ACTION_OFFER_RESOLVED = "com.motoboycity.driverapp.OFERTA_RESOLVIDA"

    fun notifyResolved(context: Context, offerId: String) {
      context.sendBroadcast(
        Intent(ACTION_OFFER_RESOLVED)
          .setPackage(context.packageName)
          .putExtra(EXTRA_OFFER_ID, offerId),
      )
    }

    private fun formatTimer(seconds: Int): String {
      val safe = seconds.coerceAtLeast(0)
      val hours = safe / 3600
      val minutes = (safe % 3600) / 60
      val secs = safe % 60
      return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, secs)
    }

    private val SURFACE = Color.rgb(255, 255, 255)
    private val INK = Color.rgb(16, 36, 45)
    private val INK_SOFT = Color.rgb(76, 91, 116)
    private val BRAND = Color.rgb(253, 160, 46)
    private val ACTION = Color.rgb(8, 68, 76)
    private val SUCCESS = Color.rgb(65, 174, 84)
    private val DANGER = Color.rgb(244, 70, 73)
    private val LINK = Color.rgb(0, 133, 230)
    private val DIVIDER = Color.rgb(226, 231, 235)
    private val DIVIDER_DARK = Color.rgb(112, 121, 132)
  }
}

/** Ícones vetoriais mínimos para o cartão nativo, sem fonte ou dependência extra. */
private class OfferIconView(
  context: Context,
  private val kind: String,
  color: Int,
) : View(context) {
  private val paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      style = Paint.Style.STROKE
      strokeWidth = resources.displayMetrics.density * 2.4f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val width = width.toFloat()
    val height = height.toFloat()
    when (kind) {
      "person" -> {
        canvas.drawCircle(width * .5f, height * .29f, width * .16f, paint)
        canvas.drawArc(width * .22f, height * .52f, width * .78f, height * 1.02f, 190f, 160f, false, paint)
      }
      "store" -> {
        canvas.drawRect(width * .2f, height * .42f, width * .8f, height * .85f, paint)
        val path = Path().apply {
          moveTo(width * .14f, height * .4f)
          lineTo(width * .22f, height * .18f)
          lineTo(width * .78f, height * .18f)
          lineTo(width * .86f, height * .4f)
          close()
        }
        canvas.drawPath(path, paint)
        canvas.drawLine(width * .38f, height * .58f, width * .38f, height * .85f, paint)
      }
      "pin" -> {
        val path = Path().apply {
          moveTo(width * .5f, height * .91f)
          cubicTo(width * .34f, height * .68f, width * .22f, height * .5f, width * .22f, height * .35f)
          cubicTo(width * .22f, height * .1f, width * .78f, height * .1f, width * .78f, height * .35f)
          cubicTo(width * .78f, height * .5f, width * .66f, height * .68f, width * .5f, height * .91f)
        }
        canvas.drawPath(path, paint)
        canvas.drawCircle(width * .5f, height * .35f, width * .09f, paint)
      }
      "flag" -> {
        canvas.drawLine(width * .27f, height * .12f, width * .27f, height * .9f, paint)
        val path = Path().apply {
          moveTo(width * .3f, height * .15f)
          lineTo(width * .78f, height * .22f)
          lineTo(width * .6f, height * .4f)
          lineTo(width * .78f, height * .55f)
          lineTo(width * .3f, height * .48f)
        }
        canvas.drawPath(path, paint)
      }
      "close" -> {
        canvas.drawLine(width * .2f, height * .2f, width * .8f, height * .8f, paint)
        canvas.drawLine(width * .8f, height * .2f, width * .2f, height * .8f, paint)
      }
      "check" -> {
        val path = Path().apply {
          moveTo(width * .14f, height * .54f)
          lineTo(width * .4f, height * .78f)
          lineTo(width * .86f, height * .24f)
        }
        canvas.drawPath(path, paint)
      }
    }
  }
}
