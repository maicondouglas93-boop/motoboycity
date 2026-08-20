package com.motoboycity.driverapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Serviço explícito e visível ao entregador. Ele só existe enquanto houver
 * ao menos uma entrega operacional e não decide nenhum status de pedido.
 */
class DeliveryLocationTrackingService : Service(), LocationListener {
  private lateinit var locationManager: LocationManager
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val deliveryIds = ConcurrentHashMap.newKeySet<String>()

  @Volatile private var baseUrl: String? = null
  @Volatile private var accessToken: String? = null
  @Volatile private var receivingUpdates = false

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      return START_NOT_STICKY
    }

    updateConfiguration(intent)
    if (deliveryIds.isEmpty() || baseUrl.isNullOrBlank() || accessToken.isNullOrBlank()) {
      stopTracking()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    requestLocationUpdates()
    return START_REDELIVER_INTENT
  }

  private fun updateConfiguration(intent: Intent?) {
    val ids = intent?.getStringArrayListExtra(EXTRA_DELIVERY_IDS)
    if (ids != null) {
      deliveryIds.clear()
      deliveryIds.addAll(ids.filter { it.isNotBlank() })
    }
    intent?.getStringExtra(EXTRA_BASE_URL)?.takeIf { it.isNotBlank() }?.let { baseUrl = it }
    intent?.getStringExtra(EXTRA_ACCESS_TOKEN)?.takeIf { it.isNotBlank() }?.let { accessToken = it }
  }

  @Suppress("MissingPermission")
  private fun requestLocationUpdates() {
    if (receivingUpdates) return
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Rastreamento interrompido: localização precisa não autorizada")
      stopTracking()
      return
    }

    try {
      locationManager.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        UPDATE_INTERVAL_MS,
        UPDATE_DISTANCE_METERS,
        this,
        Looper.getMainLooper(),
      )
      receivingUpdates = true
    } catch (error: IllegalArgumentException) {
      Log.w(TAG, "GPS indisponível para rastreamento", error)
    }
  }

  override fun onLocationChanged(location: Location) {
    val ids = deliveryIds.toList()
    val currentBaseUrl = baseUrl
    val currentAccessToken = accessToken
    if (ids.isEmpty() || currentBaseUrl.isNullOrBlank() || currentAccessToken.isNullOrBlank()) return

    executor.execute {
      ids.forEach { deliveryId ->
        val status = sendLocation(currentBaseUrl, currentAccessToken, deliveryId, location)
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED ||
          status == HttpURLConnection.HTTP_FORBIDDEN ||
          status == HttpURLConnection.HTTP_NOT_FOUND ||
          status == HttpURLConnection.HTTP_CONFLICT
        ) {
          deliveryIds.remove(deliveryId)
        }
      }
      if (deliveryIds.isEmpty()) stopTracking()
    }
  }

  private fun sendLocation(baseUrl: String, token: String, deliveryId: String, location: Location): Int? {
    return try {
      val connection = (URL("${baseUrl.trimEnd('/')}/tracking/driver/deliveries/$deliveryId/points").openConnection()
        as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = NETWORK_TIMEOUT_MS
        readTimeout = NETWORK_TIMEOUT_MS
        doOutput = true
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "application/json")
      }
      val accuracy = if (location.hasAccuracy()) ",\"accuracy\":${location.accuracy}" else ""
      val payload = "{\"lat\":${location.latitude},\"lng\":${location.longitude}$accuracy}"
      connection.outputStream.use { stream -> OutputStreamWriter(stream, Charsets.UTF_8).use { it.write(payload) } }
      connection.responseCode.also { connection.disconnect() }
    } catch (error: Exception) {
      Log.w(TAG, "Não foi possível enviar localização", error)
      null
    }
  }

  private fun stopTracking() {
    if (receivingUpdates) {
      locationManager.removeUpdates(this)
      receivingUpdates = false
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL_ID,
      "Rastreamento de entregas",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Mostra que a localização é usada durante uma entrega ativa."
    }
    (getSystemService(NotificationManager::class.java)).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val openApp = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    return builder
      .setContentTitle("Rastreamento de entrega ativo")
      .setContentText("Sua localização é compartilhada apenas durante entregas em andamento.")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(openApp)
      .setOngoing(true)
      .build()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    if (receivingUpdates) locationManager.removeUpdates(this)
    executor.shutdownNow()
    super.onDestroy()
  }

  companion object {
    const val ACTION_START_OR_UPDATE = "com.motoboycity.driverapp.tracking.START_OR_UPDATE"
    const val ACTION_STOP = "com.motoboycity.driverapp.tracking.STOP"
    const val EXTRA_DELIVERY_IDS = "deliveryIds"
    const val EXTRA_BASE_URL = "baseUrl"
    const val EXTRA_ACCESS_TOKEN = "accessToken"

    private const val TAG = "DeliveryTracking"
    private const val NOTIFICATION_CHANNEL_ID = "delivery_location_tracking"
    private const val NOTIFICATION_ID = 7412
    private const val UPDATE_INTERVAL_MS = 20_000L
    private const val UPDATE_DISTANCE_METERS = 50f
    private const val NETWORK_TIMEOUT_MS = 15_000
  }
}
