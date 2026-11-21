// ==========================================
// PK CHAT - MASTER ARCHITECTURE & MANIFEST
// Creator: Jerad Prasanth
// ==========================================

package com.pkchat.app

import android.app.Application
import android.content.ComponentCallbacks2
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.util.Log
import androidx.multidex.MultiDex
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.TimeZone

data class NetworkRoutingProfile(
    val transport: String = "cloud_direct",
    val mediaTier: String = "hd_1080p",
    val lowSignalFallbackActive: Boolean = false,
    val gpsSmsSosReady: Boolean = true,
    val lastSyncedAtMs: Long = 0L
)

data class MaintenanceReport(
    val lastRunAtMs: Long = 0L,
    val clearedCacheFiles: Int = 0,
    val healthStatus: String = "operational",
    val timezone: String = "Asia/Colombo"
)

class PKChatApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val _routingProfile = MutableStateFlow(NetworkRoutingProfile())
    val routingProfile: StateFlow<NetworkRoutingProfile> = _routingProfile.asStateFlow()

    private val _maintenanceReport = MutableStateFlow(MaintenanceReport())
    val maintenanceReport: StateFlow<MaintenanceReport> = _maintenanceReport.asStateFlow()

    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(base)
        // Initialize MultiDex early for low-end devices & low RAM optimization
        MultiDex.install(this)
    }

    override fun onCreate() {
        super.onCreate()
        MultiDex.install(this)
        installPlayVitalsCrashGuard()

        // Initialize Dedicated Private Cloud & 4K/Adaptive Media Node Routing
        initializeNetworkRouting()

        // Initialize Background Self-Healing & Midnight Auto-Maintenance Daemon (Asia/Colombo)
        startNightlySelfHealingDaemon()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            pruneTemporaryCache(maxAgeMs = 15 * 60 * 1000L)
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        pruneTemporaryCache(maxAgeMs = 5 * 60 * 1000L)
    }

    private fun installPlayVitalsCrashGuard() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                Log.e(TAG, "Recovered diagnostic trace on thread=${thread.name}", throwable)
                val logFile = File(filesDir, "pkchat_last_recovery.log")
                logFile.writeText(
                    "ts=${System.currentTimeMillis()} thread=${thread.name} err=${throwable.javaClass.simpleName}:${throwable.message}\n"
                )
            } catch (_: Throwable) {
                // Keep crash guard strictly side-effect safe
            } finally {
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }
    }

    private fun initializeNetworkRouting() {
        val connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (connectivity == null) {
            _routingProfile.value = NetworkRoutingProfile(
                transport = "offline_sms_fallback",
                mediaTier = "low_signal_resilient",
                lowSignalFallbackActive = true,
                gpsSmsSosReady = true,
                lastSyncedAtMs = System.currentTimeMillis()
            )
            return
        }

        evaluateActiveNetwork(connectivity)

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                evaluateActiveNetwork(connectivity)
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                evaluateActiveNetwork(connectivity)
            }

            override fun onLost(network: Network) {
                evaluateActiveNetwork(connectivity)
            }
        }

        try {
            connectivity.registerNetworkCallback(request, callback)
            networkCallback = callback
        } catch (t: Throwable) {
            Log.w(TAG, "Unable to register live ConnectivityManager callback", t)
        }
    }

    private fun evaluateActiveNetwork(connectivity: ConnectivityManager) {
        val activeNetwork = connectivity.activeNetwork
        val caps = activeNetwork?.let { connectivity.getNetworkCapabilities(it) }

        if (caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            _routingProfile.value = NetworkRoutingProfile(
                transport = "offline_sms_fallback",
                mediaTier = "low_signal_resilient",
                lowSignalFallbackActive = true,
                gpsSmsSosReady = true,
                lastSyncedAtMs = System.currentTimeMillis()
            )
            return
        }

        val isWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        val isCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
        val isSatellite = Build.VERSION.SDK_INT >= 35 && caps.hasTransport(NetworkCapabilities.TRANSPORT_SATELLITE)
        val downKbps = caps.linkDownstreamBandwidthKbps

        val (transport, mediaTier, lowSignal) = when {
            isSatellite -> Triple("satellite_gps_fallback", "low_signal_resilient", true)
            isWifi && downKbps >= 15_000 -> Triple("private_cloud_direct_wifi", "4k_uhd", false)
            isCellular && downKbps >= 5_000 -> Triple("private_cloud_direct_5g_lte", "hd_1080p", false)
            else -> Triple("low_signal_adaptive_relay", "low_signal_resilient", true)
        }

        _routingProfile.value = NetworkRoutingProfile(
            transport = transport,
            mediaTier = mediaTier,
            lowSignalFallbackActive = lowSignal,
            gpsSmsSosReady = true,
            lastSyncedAtMs = System.currentTimeMillis()
        )
    }

    private fun startNightlySelfHealingDaemon() {
        appScope.launch {
            while (isActive) {
                val delayMs = millisUntilNextColomboMidnight()
                delay(delayMs)
                runSandboxMaintenanceCycle()
            }
        }
    }

    fun runSandboxMaintenanceCycle(backendBaseUrl: String? = null) {
        appScope.launch(Dispatchers.IO) {
            val cleared = pruneTemporaryCache(maxAgeMs = 24 * 60 * 60 * 1000L)
            var health = "operational"

            if (!backendBaseUrl.isNullOrBlank()) {
                try {
                    val url = URL("${backendBaseUrl.trimEnd('/')}/api/system/maintenance/run")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 8_000
                        readTimeout = 8_000
                        setRequestProperty("Content-Type", "application/json")
                        doOutput = true
                    }
                    conn.outputStream.use {
                        it.write("""{"source":"android_nightly_daemon"}""".toByteArray(Charsets.UTF_8))
                    }
                    if (conn.responseCode in 200..299) {
                        val body = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(body)
                        health = json.optString("status", "operational")
                    }
                    conn.disconnect()
                } catch (t: Throwable) {
                    Log.w(TAG, "Nightly backend maintenance sync skipped cleanly", t)
                }
            }

            _maintenanceReport.value = MaintenanceReport(
                lastRunAtMs = System.currentTimeMillis(),
                clearedCacheFiles = cleared,
                healthStatus = health,
                timezone = COLOMBO_TIMEZONE_ID
            )
        }
    }

    private fun pruneTemporaryCache(maxAgeMs: Long): Int {
        var removed = 0
        val cutoff = System.currentTimeMillis() - maxAgeMs
        try {
            cacheDir.listFiles()?.forEach { file ->
                if (file.isFile && file.lastModified() < cutoff && !file.name.startsWith("pkchat_persist")) {
                    if (file.delete()) removed += 1
                }
            }
        } catch (_: Throwable) {
            // Safe no-op on storage restriction
        }
        return removed
    }

    private fun millisUntilNextColomboMidnight(): Long {
        val tz = TimeZone.getTimeZone(COLOMBO_TIMEZONE_ID)
        val now = Calendar.getInstance(tz)
        val nextMidnight = Calendar.getInstance(tz).apply {
            timeInMillis = now.timeInMillis
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 5)
            set(Calendar.MILLISECOND, 0)
        }
        return (nextMidnight.timeInMillis - now.timeInMillis).coerceAtLeast(60_000L)
    }

    override fun onTerminate() {
        super.onTerminate()
        val connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        networkCallback?.let { cb ->
            try {
                connectivity?.unregisterNetworkCallback(cb)
            } catch (_: Throwable) {
            }
        }
    }

    companion object {
        private const val TAG = "PKChatApplication"
        private const val COLOMBO_TIMEZONE_ID = "Asia/Colombo"
    }
}
