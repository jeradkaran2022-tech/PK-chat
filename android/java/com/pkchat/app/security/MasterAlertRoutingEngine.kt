// ==========================================
// PK CHAT - GLOBAL DISASTER MASTER ROUTING ENGINE
// Creator: Jerad Prasanth
// ==========================================

package com.pkchat.app.security

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

data class MasterCoreVaultEntry(
    val alertId: String,
    val title: String,
    val source: String,
    val regionCode: String,
    val interceptedAtMs: Long,
    val isVerifiedByAdmin: Boolean = false,
    val dispatchedAtMs: Long? = null
)

/**
 * PK Chat Global Disaster & Emergency Alert Master Routing Engine
 * Created by Jerad Prasanth
 *
 * Ensures that all international/global disaster feeds (USGS, NOAA, NASA EONET, etc.)
 * are mandatorily routed to the PK Chat Master Admin Core first for verification
 * before being dispatched to regional users.
 */
class MasterAlertRoutingEngine(
    private val adminCoreId: String = "JERAD_PRASANTH_MASTER_CORE",
    private val backendBaseUrl: String = ""
) {

    private val vaultQueue = ConcurrentHashMap<String, MasterCoreVaultEntry>()

    companion object {
        private const val TAG = "MasterAlertRoutingEngine"
        private const val GLOBAL_DISASTER_API = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=15"
        private val AUTHORIZED_OWNER_EMAILS = setOf(
            "jeradkaran2022@gmail.com",
            "jeradprasanth27@gmail.com"
        )
    }

    /**
     * Intercepts and routes incoming global alerts exclusively to PK Chat Admin Core first.
     */
    suspend fun interceptAndRouteGlobalAlerts(masterKeyHeader: String? = null): Boolean =
        withContext(Dispatchers.IO) {
            try {
                // Step 0: Check Firebase Master Owner verification before accepting Admin Core clearance actions
                val user = FirebaseAuth.getInstance().currentUser
                val idToken = try {
                    user?.getIdToken(false)?.await()?.token
                } catch (_: Exception) {
                    null
                }

                val url = URL(GLOBAL_DISASTER_API)
                val connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 5_000
                    readTimeout = 5_000
                }

                try {
                    if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                        val responseString = connection.inputStream.bufferedReader().use { it.readText() }
                        val jsonResponse = JSONObject(responseString)

                        // Step 1: Force routing to PK Chat Master Admin Core Quarantine Vault first
                        val routedLocally = routeToPKChatAdminCore(jsonResponse, masterKeyHeader)
                        if (!routedLocally) {
                            Log.w(TAG, "Alert routing quarantined: Master Core verification pending.")
                            return@withContext false
                        }

                        // Step 2: Synchronize intercepted payload with dedicated PK Chat Master Admin Core server if configured
                        if (backendBaseUrl.isNotBlank()) {
                            forwardToBackendAdminCore(jsonResponse, idToken, masterKeyHeader)
                        }

                        Log.i(TAG, "SUCCESS: Global alerts intercepted and locked in $adminCoreId.")
                        return@withContext true
                    }
                    false
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error routing global alert to PK Chat Admin Core: ${e.message}")
                false
            }
        }

    /**
     * Internal function to lock incoming alerts at PK Chat Admin Core pending explicit verification.
     */
    private fun routeToPKChatAdminCore(alertData: JSONObject, masterKeyHeader: String? = null): Boolean {
        val events: JSONArray = alertData.optJSONArray("events") ?: JSONArray()
        val nowMs = System.currentTimeMillis()
        for (i in 0 until events.length()) {
            val ev = events.optJSONObject(i) ?: continue
            val alertId = ev.optString("id", "eonet_${nowMs}_$i")
            val title = ev.optString("title", "Global Hazard Event")
            vaultQueue[alertId] = MasterCoreVaultEntry(
                alertId = alertId,
                title = title,
                source = "NASA EONET Earth Observatory",
                regionCode = "GLOBAL",
                interceptedAtMs = nowMs,
                isVerifiedByAdmin = false
            )
        }

        val isMasterCoreAuthorized = verifyJeradPrasanthMasterKey(masterKeyHeader)
        Log.d(
            TAG,
            "Locked ${events.length()} global feed events in $adminCoreId secure vault (masterAuthorized=$isMasterCoreAuthorized)."
        )
        return true
    }

    /**
     * Validates Jerad Prasanth's Master Owner Firebase identity (no hardcoded credentials).
     */
    private fun verifyJeradPrasanthMasterKey(masterKeyHeader: String? = null): Boolean {
        val user = FirebaseAuth.getInstance().currentUser ?: return false
        val email = user.email?.trim()?.lowercase(Locale.US) ?: return false
        if (!user.isEmailVerified || email !in AUTHORIZED_OWNER_EMAILS) {
            return false
        }
        // When a runtime Master Key token is supplied, ensure it is non-blank
        if (masterKeyHeader != null && masterKeyHeader.isBlank()) {
            return false
        }
        return true
    }

    /**
     * Dispatches verified alerts to regional users strictly after PK Chat Admin Core clearance.
     */
    fun dispatchVerifiedAlertToRegion(
        regionCode: String,
        alertPayload: JSONObject,
        isVerifiedByAdmin: Boolean,
        masterKeyHeader: String? = null
    ): Boolean {
        if (!isVerifiedByAdmin || !verifyJeradPrasanthMasterKey(masterKeyHeader)) {
            Log.w(TAG, "DISPATCH BLOCKED: Alert rejected — requires PK Chat Master Admin Core clearance.")
            return false
        }

        val alertId = alertPayload.optString("id", alertPayload.optString("alertId", "unknown"))
        val cleanRegion = regionCode.trim().uppercase(Locale.US).ifEmpty { "GLOBAL" }
        val existing = vaultQueue[alertId]
        vaultQueue[alertId] = (existing ?: MasterCoreVaultEntry(
            alertId = alertId,
            title = alertPayload.optString("title", "Verified Hazard Alert"),
            source = alertPayload.optString("officialSource", "Official Feed"),
            regionCode = cleanRegion,
            interceptedAtMs = System.currentTimeMillis()
        )).copy(
            regionCode = cleanRegion,
            isVerifiedByAdmin = true,
            dispatchedAtMs = System.currentTimeMillis()
        )

        Log.i(TAG, "DISPATCHED: Verified alert [$alertId] released from $adminCoreId to region: $cleanRegion")
        return true
    }

    fun getQuarantinedAlerts(): List<MasterCoreVaultEntry> =
        vaultQueue.values.filter { !it.isVerifiedByAdmin }.sortedByDescending { it.interceptedAtMs }

    fun getDispatchedAlerts(): List<MasterCoreVaultEntry> =
        vaultQueue.values.filter { it.isVerifiedByAdmin }.sortedByDescending { it.dispatchedAtMs ?: 0L }

    private fun forwardToBackendAdminCore(
        rawPayload: JSONObject,
        firebaseIdToken: String?,
        masterKeyHeader: String?
    ) {
        try {
            val endpoint = URL("${backendBaseUrl.trimEnd('/')}/api/disasters/master-core/intercept")
            val conn = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5_000
                readTimeout = 5_000
                setRequestProperty("Content-Type", "application/json")
                if (!firebaseIdToken.isNullOrBlank()) {
                    setRequestProperty("Authorization", "Bearer $firebaseIdToken")
                }
                if (!masterKeyHeader.isNullOrBlank()) {
                    setRequestProperty("X-PKCHAT-MASTER-KEY", masterKeyHeader.trim())
                }
                doOutput = true
            }
            val body = JSONObject().apply {
                put("adminCoreId", adminCoreId)
                put("source", "NASA_EONET_ANDROID_INTERCEPT")
                put("holdForManualClearance", true)
                put("rawPayload", rawPayload)
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            conn.responseCode
            conn.disconnect()
        } catch (t: Throwable) {
            Log.w(TAG, "Backend Master Core sync deferred: ${t.message}")
        }
    }
}
