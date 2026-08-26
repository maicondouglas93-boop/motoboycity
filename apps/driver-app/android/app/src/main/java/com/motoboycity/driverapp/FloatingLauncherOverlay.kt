package com.motoboycity.driverapp

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.ImageView
import kotlin.math.abs
import kotlin.math.roundToInt

/** Bolha nativa, arrastavel, que apenas traz a MainActivity existente para frente. */
class FloatingLauncherOverlay(private val context: Context) {
  private val windowManager = context.getSystemService(WindowManager::class.java)
  private val edgeMargin = context.dp(EDGE_MARGIN_DP)
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var view: ImageView? = null
  private var params: WindowManager.LayoutParams? = null

  fun isShown(): Boolean = view != null

  fun show(): Boolean {
    if (view != null) {
      refreshBounds()
      return true
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
      return false
    }

    val size = bubbleSize()
    val availableArea = availableArea()
    val defaultY =
      availableArea.top +
        (availableArea.height() * DEFAULT_VERTICAL_POSITION).roundToInt()
    val rightSide = FloatingShortcutStore.isOnRightSide(context)

    val layoutParams =
      WindowManager.LayoutParams(
        size,
        size,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
          @Suppress("DEPRECATION")
          WindowManager.LayoutParams.TYPE_PHONE
        },
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = if (rightSide) rightEdge(availableArea, size) else availableArea.left
        y = clampY(FloatingShortcutStore.positionY(context, defaultY), availableArea, size)
      }

    val bubble =
      ImageView(context).apply {
        contentDescription = "Abrir MOTOboyCity"
        setImageResource(R.mipmap.ic_launcher_round)
        scaleType = ImageView.ScaleType.CENTER_CROP
        elevation = context.dp(8f).toFloat()
        background =
          GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0xffffffff.toInt())
          }
        setPadding(context.dp(2f), context.dp(2f), context.dp(2f), context.dp(2f))
        setOnClickListener { openApp() }
        setOnTouchListener(DragTouchListener(layoutParams))
      }

    return try {
      windowManager.addView(bubble, layoutParams)
      view = bubble
      params = layoutParams
      true
    } catch (_: Exception) {
      view = null
      params = null
      false
    }
  }

  fun hide() {
    val currentView = view ?: return
    view = null
    params = null
    runCatching { windowManager.removeView(currentView) }
  }

  fun refreshBounds() {
    val currentView = view ?: return
    val currentParams = params ?: return
    val previousSize = currentParams.width.coerceAtLeast(1)
    val size = bubbleSize()
    val availableArea = availableArea()
    val rightSide = currentParams.x + previousSize / 2 >= availableArea.centerX()
    currentParams.width = size
    currentParams.height = size
    currentParams.x =
      if (rightSide) {
        rightEdge(availableArea, size)
      } else {
        availableArea.left
      }
    currentParams.y = clampY(currentParams.y, availableArea, size)
    runCatching { windowManager.updateViewLayout(currentView, currentParams) }
  }

  private fun openApp() {
    val intent =
      Intent(context, MainActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP,
        )
      }
    // No Android 15+, a janela ainda precisa estar visivel no instante em que
    // o app e trazido para frente. Por isso ela so some depois do startActivity.
    // DriverAppVisibility reavalia a bolha quando uma Activity realmente fica
    // visivel. Ela permanece se o modo "app aberto" estiver habilitado; se o
    // fabricante bloquear a abertura sem erro, continua disponivel.
    runCatching { context.startActivity(intent) }
  }

  private fun bubbleSize(): Int = context.dp(FloatingShortcutStore.sizeDp(context).toFloat())

  private fun rightEdge(area: Rect, size: Int): Int =
    (area.right - size).coerceAtLeast(area.left)

  private fun clampY(y: Int, area: Rect, size: Int): Int =
    y.coerceIn(area.top, (area.bottom - size).coerceAtLeast(area.top))

  private fun availableArea(): Rect {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windowManager.currentWindowMetrics
      val insets =
        metrics.windowInsets.getInsetsIgnoringVisibility(
          WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
        )
      return Rect(
        metrics.bounds.left + insets.left + edgeMargin,
        metrics.bounds.top + insets.top + edgeMargin,
        metrics.bounds.right - insets.right - edgeMargin,
        metrics.bounds.bottom - insets.bottom - edgeMargin,
      )
    }

    val visibleFrame = Rect()
    @Suppress("DEPRECATION")
    windowManager.defaultDisplay.getRectSize(visibleFrame)
    return Rect(
      visibleFrame.left + edgeMargin,
      visibleFrame.top + edgeMargin,
      visibleFrame.right - edgeMargin,
      visibleFrame.bottom - edgeMargin,
    )
  }

  private inner class DragTouchListener(
    private val layoutParams: WindowManager.LayoutParams,
  ) : View.OnTouchListener {
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var dragging = false

    override fun onTouch(touchedView: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          initialX = layoutParams.x
          initialY = layoutParams.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          dragging = false
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          val deltaX = event.rawX - initialTouchX
          val deltaY = event.rawY - initialTouchY
          if (!dragging && (abs(deltaX) > touchSlop || abs(deltaY) > touchSlop)) dragging = true
          if (dragging) {
            val size = bubbleSize()
            val availableArea = availableArea()
            layoutParams.x =
              (initialX + deltaX.roundToInt()).coerceIn(
                availableArea.left,
                (availableArea.right - size).coerceAtLeast(availableArea.left),
              )
            layoutParams.y = clampY(initialY + deltaY.roundToInt(), availableArea, size)
            runCatching { windowManager.updateViewLayout(touchedView, layoutParams) }
          }
          return true
        }

        MotionEvent.ACTION_UP -> {
          if (!dragging) {
            touchedView.performClick()
          } else {
            settleOnEdge(touchedView)
          }
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          if (dragging) settleOnEdge(touchedView)
          return true
        }
      }
      return false
    }

    private fun settleOnEdge(touchedView: View) {
      val size = bubbleSize()
      val availableArea = availableArea()
      val rightSide = layoutParams.x + size / 2 >= availableArea.centerX()
      layoutParams.x = if (rightSide) rightEdge(availableArea, size) else availableArea.left
      layoutParams.y = clampY(layoutParams.y, availableArea, size)
      FloatingShortcutStore.savePosition(context, rightSide, layoutParams.y)
      runCatching { windowManager.updateViewLayout(touchedView, layoutParams) }
    }
  }

  private fun Context.dp(value: Float): Int =
    (value * resources.displayMetrics.density).roundToInt()

  companion object {
    private const val EDGE_MARGIN_DP = 12f
    private const val DEFAULT_VERTICAL_POSITION = 0.22f
  }
}
