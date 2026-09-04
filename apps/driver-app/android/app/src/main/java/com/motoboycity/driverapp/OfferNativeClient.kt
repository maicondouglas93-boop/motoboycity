package com.motoboycity.driverapp

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class NativeOfferStop(
  val kind: String,
  val label: String,
  val address: String,
)

data class NativeOfferPresentation(
  val offerId: String,
  val deliveryIds: List<String>,
  val displayNumber: Int,
  val companyName: String,
  val paymentMethod: String,
  val driverValue: Double?,
  val distanceKm: Double?,
  val deliveryCount: Int,
  val expiresInSeconds: Int,
  val stops: List<NativeOfferStop>,
)

/**
 * Cliente mínimo usado somente enquanto o React Native está suspenso.
 *
 * O push leva apenas ids. Os endereços e valores são buscados da API
 * autenticada já existente, evitando colocar dados operacionais completos no
 * payload do Firebase e mantendo uma única fonte para o prazo restante.
 */
object OfferNativeClient {
  enum class ActionResult {
    ACCEPTED,
    DECLINED,
    UNAVAILABLE,
    NO_SESSION,
    FAILURE,
  }

  sealed interface FetchResult {
    data class Success(val offer: NativeOfferPresentation) : FetchResult

    data object Unavailable : FetchResult

    data object NoSession : FetchResult

    data object Failure : FetchResult
  }

  fun fetchPending(context: Context, expectedOfferId: String): FetchResult {
    val apiUrl = OfferSessionStore.apiUrl(context)
    val token = OfferSessionStore.accessToken(context)
    if (apiUrl.isNullOrBlank() || token.isNullOrBlank()) return FetchResult.NoSession

    val request =
      Request.Builder()
        .url("$apiUrl/delivery-offers/pending")
        .header("Authorization", "Bearer $token")
        .get()
        .build()

    return try {
      client.newCall(request).execute().use { response ->
        when {
          response.code == 401 || response.code == 403 -> FetchResult.NoSession
          !response.isSuccessful -> FetchResult.Failure
          else -> {
            val body = response.body?.string()?.trim()
            if (body.isNullOrEmpty() || body == "null") {
              FetchResult.Unavailable
            } else {
              val offer = parseOffer(JSONObject(body))
              if (offer.offerId != expectedOfferId || offer.expiresInSeconds <= 0) {
                FetchResult.Unavailable
              } else {
                OfferSessionStore.marcarOfertaApresentada(
                  context,
                  offer.offerId,
                  offer.deliveryIds.firstOrNull(),
                  System.currentTimeMillis() + offer.expiresInSeconds * 1_000L,
                )
                FetchResult.Success(offer)
              }
            }
          }
        }
      }
    } catch (_: Exception) {
      FetchResult.Failure
    }
  }

  fun respond(context: Context, action: String, offerId: String): ActionResult {
    if (!OfferSessionStore.ofertaPodeSerRespondida(context, offerId)) {
      return ActionResult.UNAVAILABLE
    }
    val apiUrl = OfferSessionStore.apiUrl(context)
    val token = OfferSessionStore.accessToken(context)
    if (apiUrl.isNullOrBlank() || token.isNullOrBlank()) return ActionResult.NO_SESSION

    val path = if (action == OfferActionReceiver.ACTION_ACCEPT) "accept" else "decline"
    val request =
      Request.Builder()
        .url("$apiUrl/delivery-offers/$offerId/$path")
        .patch(ByteArray(0).toRequestBody(null))
        .header("Authorization", "Bearer $token")
        .build()

    val attempts = if (action == OfferActionReceiver.ACTION_ACCEPT) 2 else 1
    for (attempt in 0 until attempts) {
      try {
        val call = client.newCall(request)
        call.timeout().timeout(ACTION_ATTEMPT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        val result =
          call.execute().use { response ->
            // Aceite e idempotente. Uma indisponibilidade temporaria depois de o
            // servidor receber a primeira tentativa pode ser reconciliada pela
            // segunda, sem criar duas atribuicoes.
            when {
              response.isSuccessful ->
                if (action == OfferActionReceiver.ACTION_ACCEPT) {
                  startTrackingAcceptedDeliveries(
                    context,
                    apiUrl,
                    token,
                    response.body?.string(),
                  )
                  ActionResult.ACCEPTED
                } else {
                  ActionResult.DECLINED
                }
              response.code == 404 || response.code == 409 -> ActionResult.UNAVAILABLE
              response.code == 401 || response.code == 403 -> ActionResult.NO_SESSION
              response.code >= 500 || response.code == 429 -> null
              else -> ActionResult.FAILURE
            }
          }
        if (result != null) return result
      } catch (_: Exception) {
        // A segunda tentativa idempotente cobre resposta perdida. Depois dela,
        // o GET de reconciliacao abaixo consulta o estado persistido.
      }
    }

    if (action == OfferActionReceiver.ACTION_ACCEPT) {
      if (!OfferSessionStore.ofertaPodeSerRespondida(context, offerId)) {
        return ActionResult.UNAVAILABLE
      }
      return reconcileAcceptedDelivery(context, apiUrl, token, offerId) ?: ActionResult.FAILURE
    }
    return ActionResult.FAILURE
  }

  private fun parseOffer(json: JSONObject): NativeOfferPresentation {
    val deliveries = json.getJSONArray("deliveries")
    val inBatch = deliveries.length() > 1
    val deliveryIds = mutableListOf<String>()
    val stops = mutableListOf<NativeOfferStop>()

    for (index in 0 until deliveries.length()) {
      val delivery = deliveries.getJSONObject(index)
      delivery.optString("deliveryId").takeIf { it.isNotBlank() }?.let(deliveryIds::add)
      val prefix = if (inBatch) "Pedido #${delivery.optInt("displayNumber")} — " else ""
      stops +=
        NativeOfferStop(
          kind = "store",
          label = "${prefix}Coleta",
          address = formatAddress(delivery.optJSONObject("pickupAddress")),
        )

      val destinationKnown = delivery.optBoolean("destinationKnownAtCreation", true)
      stops +=
        NativeOfferStop(
          kind = "pin",
          label = "${prefix}Entrega",
          address =
            if (destinationKnown) {
              formatAddress(delivery.optJSONObject("dropoffAddress"))
            } else {
              "Endereço definido no momento da entrega"
            },
        )

      if (delivery.optBoolean("requiresReturn", false)) {
        stops +=
          NativeOfferStop(
            kind = "flag",
            label = "${prefix}Retorno",
            address = formatAddress(delivery.optJSONObject("pickupAddress")),
          )
      }
    }

    return NativeOfferPresentation(
      offerId = json.getString("offerId"),
      deliveryIds = deliveryIds,
      displayNumber = json.optInt("displayNumber"),
      companyName = json.optString("companyName", "Empresa"),
      paymentMethod = if (json.optString("paymentMethod") == "ONLINE") "Pago online" else "Faturado",
      driverValue = json.nullableDouble("driverValue"),
      distanceKm = json.nullableDouble("distanceKm"),
      deliveryCount = deliveries.length(),
      expiresInSeconds = json.optInt("expiresInSeconds", 0),
      stops = stops,
    )
  }

  private fun formatAddress(address: JSONObject?): String {
    if (address == null) return "Endereço não informado"
    val cityState =
      listOf(address.nullableString("city"), address.nullableString("state"))
        .filterNotNull()
        .joinToString(" - ")
    val parts =
      listOf(
          address.nullableString("street"),
          address.nullableString("number"),
          address.nullableString("complement"),
          cityState.ifBlank { null },
          address.nullableString("zip"),
        )
        .filterNotNull()
    val base = parts.joinToString(", ").ifBlank { "Endereço não informado" }
    val reference = address.nullableString("referenceNote")
    return if (reference == null) base else "$base · Ref.: $reference"
  }

  private fun JSONObject.nullableString(key: String): String? {
    if (isNull(key)) return null
    return optString(key).trim().ifBlank { null }
  }

  private fun JSONObject.nullableDouble(key: String): Double? {
    if (isNull(key) || !has(key)) return null
    return optDouble(key).takeUnless { it.isNaN() }
  }

  private fun startTrackingAcceptedDeliveries(
    context: Context,
    apiUrl: String,
    token: String,
    responseBody: String?,
  ) {
    if (responseBody.isNullOrBlank()) return

    try {
      val response = JSONObject(responseBody)
      val deliveryIds = mutableListOf<String>()
      val batchIds = response.optJSONArray("deliveryIds")
      if (batchIds != null) {
        for (index in 0 until batchIds.length()) {
          batchIds.optString(index).takeIf { it.isNotBlank() }?.let { deliveryIds.add(it) }
        }
      }
      response.optString("deliveryId").takeIf { it.isNotBlank() }?.let { deliveryIds.add(it) }
      startTrackingDeliveryIds(context, apiUrl, token, deliveryIds)
    } catch (_: Exception) {
      // O aceite já foi confirmado pela API. Falha ao interpretar a resposta
      // não pode transformar sucesso em nova tentativa e aceite duplicado.
    }
  }

  /**
   * Se o PATCH foi aplicado e apenas a resposta se perdeu, a oferta ja nao
   * aparece em /pending. A entrega do push permite confirmar pelo grupo
   * protegido do proprio motoboy, sem adivinhar sucesso e sem rota nova.
   */
  private fun reconcileAcceptedDelivery(
    context: Context,
    apiUrl: String,
    token: String,
    offerId: String,
  ): ActionResult? {
    val deliveryId = OfferSessionStore.entregaDaOferta(context, offerId) ?: return null
    val request =
      Request.Builder()
        .url("$apiUrl/deliveries/$deliveryId/group")
        .header("Authorization", "Bearer $token")
        .get()
        .build()

    return try {
      val call = client.newCall(request)
      call.timeout().timeout(RECONCILIATION_TIMEOUT_MS, TimeUnit.MILLISECONDS)
      call.execute().use { response ->
        if (response.code == 401) return@use ActionResult.NO_SESSION
        if (!response.isSuccessful) return@use null
        if (OfferSessionStore.ofertaAtual(context) != offerId) return@use null

        val body = response.body?.string()?.takeIf { it.isNotBlank() } ?: return@use null
        val deliveries = JSONObject(body).optJSONArray("deliveries") ?: return@use null
        val operationalIds = mutableListOf<String>()
        var expectedAccepted = false
        for (index in 0 until deliveries.length()) {
          val delivery = deliveries.optJSONObject(index) ?: continue
          val id = delivery.optString("id")
          val status = delivery.optString("status")
          if (id.isBlank() || status !in TRACKABLE_STATUSES) continue
          operationalIds.add(id)
          if (id == deliveryId && status == "ACCEPTED") expectedAccepted = true
        }
        if (!expectedAccepted) return@use null

        startTrackingDeliveryIds(context, apiUrl, token, operationalIds)
        ActionResult.ACCEPTED
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun startTrackingDeliveryIds(
    context: Context,
    apiUrl: String,
    token: String,
    deliveryIds: Collection<String>,
  ) {
    val uniqueDeliveryIds = deliveryIds.filter(String::isNotBlank).distinct()
    if (uniqueDeliveryIds.isEmpty()) return
    DeliveryLocationTrackingService.startOrUpdate(
      context,
      uniqueDeliveryIds,
      apiUrl,
      token,
      BuildConfig.VERSION_NAME,
    )
  }

  private val client =
    OkHttpClient.Builder()
      .callTimeout(8, TimeUnit.SECONDS)
      .connectTimeout(3, TimeUnit.SECONDS)
      .readTimeout(5, TimeUnit.SECONDS)
      .build()

  private const val ACTION_ATTEMPT_TIMEOUT_MS = 2_500L
  private const val RECONCILIATION_TIMEOUT_MS = 2_000L
  private val TRACKABLE_STATUSES = setOf("ACCEPTED", "COLLECTED")
}
