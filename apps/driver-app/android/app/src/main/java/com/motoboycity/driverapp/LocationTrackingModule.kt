package com.motoboycity.driverapp

import android.content.Intent
import android.content.pm.PackageManager
import android.Manifest
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class LocationTrackingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LocationTracking"

  @ReactMethod
  fun start(
    deliveryIds: ReadableArray,
    baseUrl: String,
    accessToken: String,
    appVersion: String,
    promise: Promise,
  ) {
    val ids = deliveryIds.toArrayList().filterIsInstance<String>().filter { it.isNotBlank() }.distinct()

    if (reactContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("location_permission_required", "A localização precisa é necessária para iniciar o rastreamento.")
      return
    }

    val started =
      DeliveryLocationTrackingService.startOrUpdate(
        reactContext,
        ids,
        baseUrl,
        accessToken,
        appVersion,
      )
    if (!started) {
      promise.reject("tracking_start_failed", "Não foi possível iniciar o rastreamento.")
      return
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val intent = Intent(reactContext, DeliveryLocationTrackingService::class.java).apply {
      action = DeliveryLocationTrackingService.ACTION_STOP
    }
    reactContext.startService(intent)
    promise.resolve(null)
  }
}
