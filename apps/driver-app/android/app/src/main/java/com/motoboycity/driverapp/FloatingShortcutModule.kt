package com.motoboycity.driverapp

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FloatingShortcutModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "FloatingShortcut"

  @ReactMethod
  fun status(promise: Promise) {
    val result = Arguments.createMap()
    result.putBoolean("enabled", FloatingShortcutStore.isEnabled(reactContext))
    result.putBoolean("permissionGranted", hasOverlayPermission())
    promise.resolve(result)
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    if (enabled && !hasOverlayPermission()) {
      promise.reject(
        "overlay_permission_required",
        "Autorize Exibir sobre outros apps antes de ativar o botao flutuante.",
      )
      return
    }

    FloatingShortcutStore.setEnabled(reactContext, enabled)
    reactContext.sendBroadcast(
      Intent(DeliveryLocationTrackingService.ACTION_REFRESH_FLOATING_SHORTCUT).setPackage(
        reactContext.packageName,
      ),
    )
    promise.resolve(null)
  }

  private fun hasOverlayPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
}
