package com.motoboycity.driverapp

import android.content.Context

/** Preferencias locais da bolha. Nao guarda sessao, token ou dado operacional. */
object FloatingShortcutStore {
  private const val PREFERENCES = "floating_shortcut"
  // Mantem a chave antiga para preservar quem ja ativou o atalho no pilot.4+.
  private const val KEY_ENABLED = "enabled"
  private const val KEY_ENABLED_WHEN_OPEN = "enabled_when_open"
  private const val KEY_SIZE_DP = "size_dp"
  private const val KEY_KEEP_SCREEN_ON = "keep_screen_on"
  private const val KEY_RIGHT_SIDE = "right_side"
  private const val KEY_POSITION_Y = "position_y"

  fun showWhenMinimized(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  fun setShowWhenMinimized(context: Context, enabled: Boolean) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
  }

  fun showWhenOpen(context: Context): Boolean =
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getBoolean(KEY_ENABLED_WHEN_OPEN, false)

  fun setShowWhenOpen(context: Context, enabled: Boolean) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED_WHEN_OPEN, enabled)
      .apply()
  }

  fun sizeDp(context: Context): Int =
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getInt(KEY_SIZE_DP, DEFAULT_SIZE_DP)
      .coerceIn(MIN_SIZE_DP, MAX_SIZE_DP)

  fun setSizeDp(context: Context, sizeDp: Int) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putInt(KEY_SIZE_DP, sizeDp.coerceIn(MIN_SIZE_DP, MAX_SIZE_DP))
      .apply()
  }

  fun keepScreenOn(context: Context): Boolean =
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getBoolean(KEY_KEEP_SCREEN_ON, false)

  fun setKeepScreenOn(context: Context, enabled: Boolean) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_KEEP_SCREEN_ON, enabled)
      .apply()
  }

  fun isOnRightSide(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_RIGHT_SIDE, true)

  fun positionY(context: Context, fallback: Int): Int =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getInt(KEY_POSITION_Y, fallback)

  fun savePosition(context: Context, rightSide: Boolean, y: Int) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_RIGHT_SIDE, rightSide)
      .putInt(KEY_POSITION_Y, y)
      .apply()
  }

  const val MIN_SIZE_DP = 48
  const val MAX_SIZE_DP = 96
  const val DEFAULT_SIZE_DP = 64
}
