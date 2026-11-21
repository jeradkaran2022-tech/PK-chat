package com.pkchat.security

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.telephony.SmsManager
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Coordinates Android Runtime Permissions, Offline GPS fixes, and Standard SIM SMS
 * fallback dispatch for PK CHAT SOS emergencies when mobile data/Wi-Fi is unavailable.
 *
 * Required manifest permissions:
 * - ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION
 * - SEND_SMS, READ_PHONE_STATE
 *
 * Expose to WebView via:
 *   webView.addJavascriptInterface(PkChatOfflineSmsSosManager(activity), "PkChatAndroidBridge")
 */
class PkChatOfflineSmsSosManager(
    private val activity: Activity
) {
    companion object {
        const val REQUEST_CODE_SOS_PERMISSIONS = 4092

        val REQUIRED_SOS_PERMISSIONS = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_PHONE_STATE
        )

        const val ACTION_SMS_SENT = "com.pkchat.app.SOS_SMS_SENT"
    }

    @JavascriptInterface
    fun hasSmsAndLocationPermissions(): Boolean {
        val hasFine = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasSms = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
        val hasPhoneState = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        return (hasFine || hasCoarse) && hasSms && hasPhoneState
    }

    @JavascriptInterface
    fun requestSmsAndLocationPermissions() {
        ActivityCompat.requestPermissions(
            activity,
            REQUIRED_SOS_PERMISSIONS,
            REQUEST_CODE_SOS_PERMISSIONS
        )
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    fun getLastKnownGpsJson(): String {
        val hasFine = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasFine && !hasCoarse) return ""

        val lm = activity.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return ""
        val providers = listOfNotNull(
            if (hasFine && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else null,
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) LocationManager.NETWORK_PROVIDER else null,
            LocationManager.PASSIVE_PROVIDER
        )

        var bestLocation: Location? = null
        for (provider in providers) {
            val candidate = runCatching { lm.getLastKnownLocation(provider) }.getOrNull() ?: continue
            if (bestLocation == null || candidate.accuracy < bestLocation.accuracy) {
                bestLocation = candidate
            }
        }

        val loc = bestLocation ?: return ""
        return JSONObject().apply {
            put("latitude", loc.latitude)
            put("longitude", loc.longitude)
            if (loc.hasAccuracy()) {
                put("accuracyMeters", loc.accuracy.toDouble())
            }
        }.toString()
    }

    /**
     * Sends an offline emergency SMS over the device's cellular SIM to each comma-separated
     * trusted emergency contact number. Supports multipart messages > 160 chars.
     */
    @JavascriptInterface
    fun sendEmergencySms(recipientsCsv: String, messageBody: String): Boolean {
        val hasSms = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasSms) {
            requestSmsAndLocationPermissions()
            return false
        }

        val recipients = recipientsCsv
            .split(",")
            .map { it.trim() }
            .filter { it.length >= 3 }
            .distinct()

        if (recipients.isEmpty() || messageBody.isBlank()) return false

        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            activity.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        } ?: return false

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val sentIntent = PendingIntent.getBroadcast(
            activity,
            0,
            Intent(ACTION_SMS_SENT),
            flags
        )

        var allAccepted = true
        for (number in recipients) {
            val dispatched = runCatching {
                val parts = smsManager.divideMessage(messageBody)
                if (parts.size > 1) {
                    val sentIntents = ArrayList<PendingIntent>(parts.size).apply {
                        repeat(parts.size) { add(sentIntent) }
                    }
                    smsManager.sendMultipartTextMessage(number, null, parts, sentIntents, null)
                } else {
                    smsManager.sendTextMessage(number, null, messageBody, sentIntent, null)
                }
                true
            }.getOrDefault(false)

            if (!dispatched) {
                allAccepted = false
            }
        }
        return allAccepted
    }
}
