package com.pkchat.security

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Coordinates real-time Firestore `/system_security/global` monitoring,
 * the automatic 10-second recheck recovery loop, and voice alert playback
 * for Android Jetpack Compose screens.
 */
class PkChatSecurityManager(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
    private val voiceAnnouncer: PkChatVoiceAnnouncer,
    private val backendBaseUrl: String,
    private val scope: CoroutineScope
) {
    private val _securityState = MutableStateFlow(GlobalSecurityState())
    val securityState: StateFlow<GlobalSecurityState> = _securityState.asStateFlow()

    private val _countdownSeconds = MutableStateFlow(10)
    val countdownSeconds: StateFlow<Int> = _countdownSeconds.asStateFlow()

    private var listenerRegistration: ListenerRegistration? = null
    private var recheckLoopJob: Job? = null
    private var lastAnnouncedStatus: SystemSecurityStatus = SystemSecurityStatus.NORMAL

    fun startMonitoring(
        preferredLanguageProvider: () -> String,
        voiceEnabledProvider: () -> Boolean
    ) {
        stopMonitoring()

        listenerRegistration = firestore
            .collection("system_security")
            .document("global")
            .addSnapshotListener { snapshot, _ ->
                if (snapshot == null || !snapshot.exists()) return@addSnapshotListener
                val nextStatus = SystemSecurityStatus.fromRaw(snapshot.getString("status"))
                @Suppress("UNCHECKED_CAST")
                val actions = (snapshot.get("restrictedActions") as? List<String>) ?: emptyList()

                val updated = GlobalSecurityState(
                    status = nextStatus,
                    reasonCode = snapshot.getString("reasonCode") ?: "SYSTEM_HEALTHY",
                    activeIncidentId = snapshot.getString("activeIncidentId"),
                    ownerApprovalRequired = snapshot.getBoolean("ownerApprovalRequired") ?: false,
                    lockdownStartedAtMs = snapshot.getTimestamp("lockdownStartedAt")?.toDate()?.time,
                    lastRecheckAtMs = snapshot.getTimestamp("lastRecheckAt")?.toDate()?.time,
                    nextRecheckInSeconds = (snapshot.getLong("nextRecheckInSeconds") ?: 10L).toInt(),
                    restrictedActions = actions,
                    preserveUserData = snapshot.getBoolean("preserveUserData") ?: true
                )
                _securityState.value = updated

                if (nextStatus != lastAnnouncedStatus) {
                    lastAnnouncedStatus = nextStatus
                    val lang = preferredLanguageProvider()
                    val strings = SecurityLanguageCatalog.forPreference(lang)
                    val announcement = when (nextStatus) {
                        SystemSecurityStatus.LOCKDOWN ->
                            "${strings.statusLockdownTitle}. ${strings.statusLockdownBody} ${strings.dataSafeGuarantee}"
                        SystemSecurityStatus.RECOVERING ->
                            "${strings.statusRecoveringTitle}. ${strings.statusRecoveringBody}"
                        SystemSecurityStatus.NORMAL ->
                            "${strings.statusNormalTitle}. ${strings.statusNormalBody}"
                    }
                    voiceAnnouncer.speakIfEnabled(voiceEnabledProvider(), lang, announcement)
                }
            }

        recheckLoopJob = scope.launch {
            while (isActive) {
                if (_securityState.value.status != SystemSecurityStatus.NORMAL) {
                    for (sec in 10 downTo 1) {
                        if (!isActive || _securityState.value.status == SystemSecurityStatus.NORMAL) break
                        _countdownSeconds.value = sec
                        delay(1_000L)
                    }
                    if (_securityState.value.status != SystemSecurityStatus.NORMAL) {
                        triggerServerRecheck()
                    }
                } else {
                    _countdownSeconds.value = 10
                    delay(2_000L)
                }
            }
        }
    }

    private suspend fun triggerServerRecheck() = withContext(Dispatchers.IO) {
        try {
            val conn = (URL("${backendBaseUrl.trimEnd('/')}/api/security/recheck").openConnection() as HttpURLConnection)
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = 5_000
            conn.readTimeout = 5_000
            conn.doOutput = true
            conn.outputStream.use { it.write("{}".toByteArray()) }
            conn.responseCode
            conn.disconnect()
        } catch (_: Exception) {
            // Firestore listener remains authoritative; next 10s cycle retries cleanly
        }
    }

    fun canAttemptLogin(isVerifiedOwner: Boolean = false): Boolean =
        _securityState.value.status != SystemSecurityStatus.LOCKDOWN || isVerifiedOwner

    fun canSendMessage(): Boolean =
        _securityState.value.status != SystemSecurityStatus.LOCKDOWN

    fun canModifyAccount(): Boolean =
        _securityState.value.status != SystemSecurityStatus.LOCKDOWN

    fun canStartCall(): Boolean =
        _securityState.value.status != SystemSecurityStatus.LOCKDOWN

    fun replayCurrentVoiceAlert(preferredLanguageCode: String, voiceEnabled: Boolean) {
        val strings = SecurityLanguageCatalog.forPreference(preferredLanguageCode)
        val body = when (_securityState.value.status) {
            SystemSecurityStatus.LOCKDOWN ->
                "${strings.statusLockdownTitle}. ${strings.statusLockdownBody} ${strings.dataSafeGuarantee}"
            SystemSecurityStatus.RECOVERING ->
                "${strings.statusRecoveringTitle}. ${strings.statusRecoveringBody}"
            SystemSecurityStatus.NORMAL ->
                "${strings.statusNormalTitle}. ${strings.statusNormalBody}"
        }
        voiceAnnouncer.speakIfEnabled(voiceEnabled, preferredLanguageCode, body)
    }

    fun stopMonitoring() {
        listenerRegistration?.remove()
        listenerRegistration = null
        recheckLoopJob?.cancel()
        recheckLoopJob = null
        voidAuthCheck()
    }

    private fun voidAuthCheck() {
        auth.currentUser
    }
}
