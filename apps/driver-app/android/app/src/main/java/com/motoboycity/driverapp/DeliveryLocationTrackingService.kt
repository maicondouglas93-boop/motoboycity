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
 * Serviço explícito e visível enquanto o entregador estiver online. O mesmo
 * fix renova a presença e alimenta as entregas operacionais atuais.
 */
class DeliveryLocationTrackingService : Service(), LocationListener {
  private lateinit var locationManager: LocationManager
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val deliveryIds = ConcurrentHashMap.newKeySet<String>()

  @Volatile private var baseUrl: String? = null
  @Volatile private var accessToken: String? = null
  @Volatile private var appVersion: String? = null
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
    if (baseUrl.isNullOrBlank() || accessToken.isNullOrBlank() || appVersion.isNullOrBlank()) {
      stopTracking()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    requestLocationUpdates(force = true)
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
    intent?.getStringExtra(EXTRA_APP_VERSION)?.takeIf { it.isNotBlank() }?.let { appVersion = it }
  }

  @Suppress("MissingPermission")
  private fun requestLocationUpdates(force: Boolean = false) {
    if (receivingUpdates && !force) return
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Rastreamento interrompido: localização precisa não autorizada")
      stopTracking()
      return
    }

    try {
      if (receivingUpdates) locationManager.removeUpdates(this)
      val updateInterval = if (deliveryIds.isEmpty()) IDLE_UPDATE_INTERVAL_MS else ACTIVE_UPDATE_INTERVAL_MS
      val updateDistance = if (deliveryIds.isEmpty()) IDLE_UPDATE_DISTANCE_METERS else ACTIVE_UPDATE_DISTANCE_METERS
      locationManager.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        updateInterval,
        updateDistance,
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
    val currentAppVersion = appVersion
    if (currentBaseUrl.isNullOrBlank() || currentAccessToken.isNullOrBlank() || currentAppVersion.isNullOrBlank()) return

    executor.execute {
      val heartbeatStatus = sendPresenceHeartbeat(
        currentBaseUrl,
        currentAccessToken,
        currentAppVersion,
        location,
      )
      if (heartbeatStatus == HttpURLConnection.HTTP_UNAUTHORIZED ||
        heartbeatStatus == HttpURLConnection.HTTP_FORBIDDEN ||
        heartbeatStatus == HttpURLConnection.HTTP_CONFLICT
      ) {
        stopTracking()
        return@execute
      }
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
    }
  }

  private fun sendPresenceHeartbeat(
    baseUrl: String,
    token: String,
    version: String,
    location: Location,
  ): Int? {
    val accuracy = if (location.hasAccuracy()) ",\"accuracy\":${location.accuracy}" else ""
    val payload =
      "{\"lat\":${location.latitude},\"lng\":${location.longitude}$accuracy,\"appVersion\":\"${escapeJson(version)}\"}"
    return sendJson("${baseUrl.trimEnd('/')}/driver/presence/heartbeat", token, payload)
  }

  private fun sendLocation(baseUrl: String, token: String, deliveryId: String, location: Location): Int? {
    val accuracy = if (location.hasAccuracy()) ",\"accuracy\":${location.accuracy}" else ""
    val payload = "{\"lat\":${location.latitude},\"lng\":${location.longitude}$accuracy}"
    return sendJson(
      "${baseUrl.trimEnd('/')}/tracking/driver/deliveries/$deliveryId/points",
      token,
      payload,
    )
  }

  private fun sendJson(url: String, token: String, payload: String): Int? {
    return try {
      val connection = (URL(url).openConnection()
        as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = NETWORK_TIMEOUT_MS
        readTimeout = NETWORK_TIMEOUT_MS
        doOutput = true
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "application/json")
      }
      connection.outputStream.use { stream -> OutputStreamWriter(stream, Charsets.UTF_8).use { it.write(payload) } }
      connection.responseCode.also { connection.disconnect() }
    } catch (error: Exception) {
      Log.w(TAG, "Não foi possível enviar localização", error)
      null
    }
  }

  private fun escapeJson(value: String): String = value.replace("\\", "\\\\").replace("\"", "\\\"")

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
      "Localização enquanto online",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Mostra que a localização é compartilhada enquanto você está online."
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
      .setContentTitle("Você está online")
      .setContentText("Sua localização está sendo compartilhada com a operação.")
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
    const val EXTRA_APP_VERSION = "appVersion"

    private const val TAG = "DeliveryTracking"
    private const val NOTIFICATION_CHANNEL_ID = "delivery_location_tracking"
    private const val NOTIFICATION_ID = 7412
    private const val ACTIVE_UPDATE_INTERVAL_MS = 20_000L
    private const val ACTIVE_UPDATE_DISTANCE_METERS = 50f
    private const val IDLE_UPDATE_INTERVAL_MS = 60_000L
    private const val IDLE_UPDATE_DISTANCE_METERS = 100f
    private const val NETWORK_TIMEOUT_MS = 15_000

    fun startOrUpdate(
      context: Context,
      deliveryIds: Collection<String>,
      baseUrl: String,
      accessToken: String,
      appVersion: String,
    ): Boolean {
      val ids = deliveryIds.filter { it.isNotBlank() }.distinct()
      if (
        baseUrl.isBlank() ||
          accessToken.isBlank() ||
          appVersion.isBlank() ||
          context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
      ) {
        return false
      }

      val intent = Intent(context, DeliveryLocationTrackingService::class.java).apply {
        action = ACTION_START_OR_UPDATE
        putStringArrayListExtra(EXTRA_DELIVERY_IDS, ArrayList(ids))
        putExtra(EXTRA_BASE_URL, baseUrl)
        putExtra(EXTRA_ACCESS_TOKEN, accessToken)
        putExtra(EXTRA_APP_VERSION, appVersion)
      }

      return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        Log.e(TAG, "Não foi possível iniciar o rastreamento nativo", error)
        false
      }
    }
  }
}
