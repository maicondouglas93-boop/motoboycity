package com.motoboycity.driverapp

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Conta Activities visiveis para a bolha nao cobrir o proprio aplicativo nem
 * o cartao nativo de oferta. A contagem tambem evita piscar entre Activities.
 */
object DriverAppVisibility : Application.ActivityLifecycleCallbacks {
  const val ACTION_VISIBILITY_CHANGED =
    "com.motoboycity.driverapp.FLOATING_SHORTCUT_VISIBILITY_CHANGED"
  const val EXTRA_VISIBLE = "visible"

  private var startedActivities = 0

  @Volatile private var visible = false

  fun register(application: Application) {
    application.registerActivityLifecycleCallbacks(this)
  }

  fun isVisible(): Boolean = visible

  override fun onActivityStarted(activity: Activity) {
    startedActivities += 1
    updateVisibility(activity, true)
  }

  override fun onActivityStopped(activity: Activity) {
    startedActivities = (startedActivities - 1).coerceAtLeast(0)
    updateVisibility(activity, startedActivities > 0)
  }

  private fun updateVisibility(context: Context, nextVisible: Boolean) {
    if (visible == nextVisible) return
    visible = nextVisible
    context.sendBroadcast(
      Intent(ACTION_VISIBILITY_CHANGED)
        .setPackage(context.packageName)
        .putExtra(EXTRA_VISIBLE, nextVisible),
    )
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

  override fun onActivityResumed(activity: Activity) = Unit

  override fun onActivityPaused(activity: Activity) = Unit

  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

  override fun onActivityDestroyed(activity: Activity) = Unit
}
