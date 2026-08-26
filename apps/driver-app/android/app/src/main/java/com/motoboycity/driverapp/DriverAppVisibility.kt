package com.motoboycity.driverapp

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Conta Activities visiveis para distinguir app aberto de minimizado. O cartao
 * nativo de oferta continua bloqueando a bolha mesmo quando o usuario escolhe
 * exibi-la sobre a MainActivity.
 */
object DriverAppVisibility : Application.ActivityLifecycleCallbacks {
  const val ACTION_VISIBILITY_CHANGED =
    "com.motoboycity.driverapp.FLOATING_SHORTCUT_VISIBILITY_CHANGED"
  const val EXTRA_VISIBLE = "visible"

  private var startedActivities = 0
  private var startedOfferActivities = 0

  @Volatile private var visible = false
  @Volatile private var offerVisible = false

  fun register(application: Application) {
    application.registerActivityLifecycleCallbacks(this)
  }

  fun isVisible(): Boolean = visible

  fun isOfferVisible(): Boolean = offerVisible

  override fun onActivityStarted(activity: Activity) {
    startedActivities += 1
    if (activity is OfferActivity) startedOfferActivities += 1
    updateVisibility(activity, true, startedOfferActivities > 0)
  }

  override fun onActivityStopped(activity: Activity) {
    startedActivities = (startedActivities - 1).coerceAtLeast(0)
    if (activity is OfferActivity) {
      startedOfferActivities = (startedOfferActivities - 1).coerceAtLeast(0)
    }
    updateVisibility(activity, startedActivities > 0, startedOfferActivities > 0)
  }

  private fun updateVisibility(
    context: Context,
    nextVisible: Boolean,
    nextOfferVisible: Boolean,
  ) {
    if (visible == nextVisible && offerVisible == nextOfferVisible) return
    visible = nextVisible
    offerVisible = nextOfferVisible
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
