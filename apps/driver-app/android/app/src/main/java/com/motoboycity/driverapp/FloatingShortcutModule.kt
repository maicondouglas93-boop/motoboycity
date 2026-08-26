package com.motoboycity.driverapp

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.roundToInt

class FloatingShortcutModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "FloatingShortcut"

  @ReactMethod
  fun status(promise: Promise) {
    val result = Arguments.createMap()
    val enabledWhenMinimized = FloatingShortcutStore.showWhenMinimized(reactContext)
    // `enabled` permanece como alias para JS antigo durante atualizacao do APK.
    result.putBoolean("enabled", enabledWhenMinimized)
    result.putBoolean("enabledWhenMinimized", enabledWhenMinimized)
    result.putBoolean("enabledWhenOpen", FloatingShortcutStore.showWhenOpen(reactContext))
    result.putInt("sizeDp", FloatingShortcutStore.sizeDp(reactContext))
    result.putBoolean("keepScreenOn", FloatingShortcutStore.keepScreenOn(reactContext))
    result.putBoolean("permissionGranted", hasOverlayPermission())
    promise.resolve(result)
  }

  /** Compatibilidade com a primeira versao: equivale ao modo minimizado. */
  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    setVisibilityPreference(enabled, promise) {
      FloatingShortcutStore.setShowWhenMinimized(reactContext, enabled)
    }
  }

  @ReactMethod
  fun setEnabledWhenMinimized(enabled: Boolean, promise: Promise) {
    setVisibilityPreference(enabled, promise) {
      FloatingShortcutStore.setShowWhenMinimized(reactContext, enabled)
    }
  }

  @ReactMethod
  fun setEnabledWhenOpen(enabled: Boolean, promise: Promise) {
    setVisibilityPreference(enabled, promise) {
      FloatingShortcutStore.setShowWhenOpen(reactContext, enabled)
    }
  }

  @ReactMethod
  fun setSizeDp(sizeDp: Double, promise: Promise) {
    val normalizedSize =
      if (sizeDp.isFinite()) sizeDp.roundToInt() else FloatingShortcutStore.DEFAULT_SIZE_DP
    FloatingShortcutStore.setSizeDp(reactContext, normalizedSize)
    refreshFloatingShortcut()
    promise.resolve(null)
  }

  @ReactMethod
  fun setKeepScreenOn(enabled: Boolean, promise: Promise) {
    FloatingShortcutStore.setKeepScreenOn(reactContext, enabled)
    (reactContext.currentActivity as? MainActivity)?.applyKeepScreenOn(enabled)
    promise.resolve(null)
  }

  private fun setVisibilityPreference(
    enabled: Boolean,
    promise: Promise,
    persist: () -> Unit,
  ) {
    if (enabled && !hasOverlayPermission()) {
      promise.reject(
        "overlay_permission_required",
        "Autorize Exibir sobre outros apps antes de ativar o botao flutuante.",
      )
      return
    }

    persist()
    refreshFloatingShortcut()
    promise.resolve(null)
  }

  private fun refreshFloatingShortcut() {
    reactContext.sendBroadcast(
      Intent(DeliveryLocationTrackingService.ACTION_REFRESH_FLOATING_SHORTCUT).setPackage(
        reactContext.packageName,
      ),
    )
  }

  private fun hasOverlayPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
}
