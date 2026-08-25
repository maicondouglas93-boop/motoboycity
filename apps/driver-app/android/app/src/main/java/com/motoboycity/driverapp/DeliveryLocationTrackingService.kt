package com.motoboycity.driverapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Serviço explícito e visível enquanto o entregador estiver online. O mesmo
 * fix renova a presença e alimenta as entregas operacionais atuais.
 */
class DeliveryLocationTrackingService : Service(), LocationListener {
  private lateinit var locationManager: LocationManager
  private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private val deliveryIds = ConcurrentHashMap.newKeySet<String>()
  private val pendingLocation = AtomicReference<Location?>(null)
  private val latestLocation = AtomicReference<Location?>(null)
  private val sendingLocation = AtomicBoolean(false)
  private var heartbeatTask: ScheduledFuture<*>? = null
  private lateinit var floatingShortcut: FloatingLauncherOverlay
  private var floatingShortcutReceiverRegistered = false

  private val floatingShortcutReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        refreshFloatingShortcut()
      }
    }

  @Volatile private var baseUrl: String? = null
  @Volatile private var accessToken: String? = null
  @Volatile private var appVersion: String? = null
  @Volatile private var receivingUpdates = false

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    floatingShortcut = FloatingLauncherOverlay(this)
    registerFloatingShortcutReceiver()
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
    refreshFloatingShortcut()
    requestLocationUpdates(force = true)
    startHeartbeatLoop()
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
      val enabledProviders =
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { provider ->
          runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
        }
      if (enabledProviders.isEmpty()) {
        Log.w(TAG, "Rastreamento interrompido: nenhum provedor de localização está ativo")
        stopTracking()
        return
      }
      enabledProviders.forEach { provider ->
        locationManager.requestLocationUpdates(
          provider,
          updateInterval,
          updateDistance,
          this,
          Looper.getMainLooper(),
        )
      }
      enabledProviders
        .mapNotNull { provider -> runCatching { locationManager.getLastKnownLocation(provider) }.getOrNull() }
        .maxByOrNull { location -> location.time }
        ?.let { latestLocation.compareAndSet(null, Location(it)) }
      receivingUpdates = true
    } catch (error: Exception) {
      Log.w(TAG, "Provedor de localização indisponível para rastreamento", error)
      stopTracking()
    }
  }

  override fun onLocationChanged(location: Location) {
    refreshFloatingShortcut()
    latestLocation.set(Location(location))
    pendingLocation.set(Location(location))
    drainLatestLocation()
  }

  /**
   * Presenca e deslocamento sao sinais diferentes.
   *
   * O servidor expira um motoboy depois de 150 segundos sem heartbeat. Antes,
   * o heartbeat vivia somente em `onLocationChanged`, mas a requisicao de GPS
   * aceita atualizacao apenas depois de 50/100 metros. Um motoboy parado em uma
   * loja ficava offline mesmo com GPS, internet e servico ativos.
   *
   * Este relogio renova a presenca com a ultima posicao valida. Os pontos das
   * entregas continuam sendo enviados somente quando chega uma localizacao
   * nova, portanto ficar parado nao polui o historico da rota.
   */
  private fun startHeartbeatLoop() {
    if (heartbeatTask?.isCancelled == false && heartbeatTask?.isDone == false) return
    heartbeatTask =
      executor.scheduleWithFixedDelay(
        { sendHeartbeatFromLatestLocation() },
        HEARTBEAT_INTERVAL_MS,
        HEARTBEAT_INTERVAL_MS,
        TimeUnit.MILLISECONDS,
      )
  }

  private fun sendHeartbeatFromLatestLocation() {
    if (!hasLocationPermission() || !hasEnabledLocationProvider()) {
      stopTracking()
      return
    }
    val location = latestLocation.get() ?: return
    val currentBaseUrl = baseUrl ?: return
    val currentAccessToken = accessToken ?: return
    val currentAppVersion = appVersion ?: return
    val status =
      sendPresenceHeartbeat(
        currentBaseUrl,
        currentAccessToken,
        currentAppVersion,
        location,
      ) ?: return
    if (
      status == HttpURLConnection.HTTP_UNAUTHORIZED ||
        status == HttpURLConnection.HTTP_FORBIDDEN ||
        status == HttpURLConnection.HTTP_CONFLICT
    ) {
      Log.w(TAG, "Heartbeat recusado pela API: HTTP $status")
      stopTracking()
    }
  }

  private fun hasLocationPermission(): Boolean =
    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun hasEnabledLocationProvider(): Boolean =
    listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).any { provider ->
      runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
    }

  private fun drainLatestLocation() {
    if (executor.isShutdown || !sendingLocation.compareAndSet(false, true)) return

    executor.execute {
      try {
        while (true) {
          val location = pendingLocation.getAndSet(null) ?: break
          sendLocationBatch(location)
        }
      } finally {
        sendingLocation.set(false)
        if (pendingLocation.get() != null) drainLatestLocation()
      }
    }
  }

  private fun sendLocationBatch(location: Location) {
    val ids = deliveryIds.toList()
    val currentBaseUrl = baseUrl
    val currentAccessToken = accessToken
    val currentAppVersion = appVersion
    if (currentBaseUrl.isNullOrBlank() || currentAccessToken.isNullOrBlank() || currentAppVersion.isNullOrBlank()) return

    val heartbeatStatus = sendPresenceHeartbeat(
      currentBaseUrl,
      currentAccessToken,
      currentAppVersion,
      location,
    ) ?: return
    if (heartbeatStatus == HttpURLConnection.HTTP_UNAUTHORIZED ||
      heartbeatStatus == HttpURLConnection.HTTP_FORBIDDEN ||
      heartbeatStatus == HttpURLConnection.HTTP_CONFLICT
    ) {
      stopTracking()
      return
    }
    if (heartbeatStatus >= 500 || heartbeatStatus == 429) return

    for (deliveryId in ids) {
      val status = sendLocation(currentBaseUrl, currentAccessToken, deliveryId, location) ?: break
      if (status == HttpURLConnection.HTTP_UNAUTHORIZED ||
        status == HttpURLConnection.HTTP_FORBIDDEN ||
        status == HttpURLConnection.HTTP_NOT_FOUND ||
        status == HttpURLConnection.HTTP_CONFLICT
      ) {
        deliveryIds.remove(deliveryId)
      }
      if (status >= 500 || status == 429) break
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
    floatingShortcut.hide()
    heartbeatTask?.cancel(false)
    heartbeatTask = null
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

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    floatingShortcut.refreshBounds()
  }

  override fun onDestroy() {
    floatingShortcut.hide()
    if (floatingShortcutReceiverRegistered) {
      runCatching { unregisterReceiver(floatingShortcutReceiver) }
      floatingShortcutReceiverRegistered = false
    }
    heartbeatTask?.cancel(true)
    heartbeatTask = null
    if (receivingUpdates) locationManager.removeUpdates(this)
    executor.shutdownNow()
    super.onDestroy()
  }

  private fun registerFloatingShortcutReceiver() {
    val filter =
      IntentFilter().apply {
        addAction(DriverAppVisibility.ACTION_VISIBILITY_CHANGED)
        addAction(ACTION_REFRESH_FLOATING_SHORTCUT)
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(floatingShortcutReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(floatingShortcutReceiver, filter)
    }
    floatingShortcutReceiverRegistered = true
  }

  private fun refreshFloatingShortcut() {
    val permissionGranted =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    val shouldShow =
      FloatingShortcutStore.isEnabled(this) && permissionGranted && !DriverAppVisibility.isVisible()
    if (shouldShow) {
      floatingShortcut.show()
    } else {
      floatingShortcut.hide()
    }
  }

  companion object {
    const val ACTION_START_OR_UPDATE = "com.motoboycity.driverapp.tracking.START_OR_UPDATE"
    const val ACTION_STOP = "com.motoboycity.driverapp.tracking.STOP"
    const val ACTION_REFRESH_FLOATING_SHORTCUT =
      "com.motoboycity.driverapp.tracking.REFRESH_FLOATING_SHORTCUT"
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
    private const val HEARTBEAT_INTERVAL_MS = 60_000L
    private const val NETWORK_TIMEOUT_MS = 8_000

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

      val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val hasEnabledProvider =
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).any { provider ->
          runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)
        }
      if (!hasEnabledProvider) return false

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
