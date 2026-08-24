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
        client.newCall(request).execute().use { response ->
          return when {
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
            else -> ActionResult.FAILURE
          }
        }
      } catch (_: Exception) {
        if (attempt == attempts - 1) return ActionResult.FAILURE
      }
    }
    return ActionResult.FAILURE
  }

  private fun parseOffer(json: JSONObject): NativeOfferPresentation {
    val deliveries = json.getJSONArray("deliveries")
    val inBatch = deliveries.length() > 1
    val stops = mutableListOf<NativeOfferStop>()

    for (index in 0 until deliveries.length()) {
      val delivery = deliveries.getJSONObject(index)
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
      if (deliveryIds.isEmpty()) return

      DeliveryLocationTrackingService.startOrUpdate(
        context,
        deliveryIds,
        apiUrl,
        token,
        BuildConfig.VERSION_NAME,
      )
    } catch (_: Exception) {
      // O aceite já foi confirmado pela API. Falha ao interpretar a resposta
      // não pode transformar sucesso em nova tentativa e aceite duplicado.
    }
  }

  private val client =
    OkHttpClient.Builder()
      .callTimeout(8, TimeUnit.SECONDS)
      .connectTimeout(3, TimeUnit.SECONDS)
      .readTimeout(5, TimeUnit.SECONDS)
      .build()
}
