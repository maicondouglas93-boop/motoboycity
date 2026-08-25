package com.motoboycity.driverapp

import android.content.Context

/** Preferencias locais da bolha. Nao guarda sessao, token ou dado operacional. */
object FloatingShortcutStore {
  private const val PREFERENCES = "floating_shortcut"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_RIGHT_SIDE = "right_side"
  private const val KEY_POSITION_Y = "position_y"

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  fun setEnabled(context: Context, enabled: Boolean) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
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
}
