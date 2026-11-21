package com.pkchat.security

enum class SystemSecurityStatus {
    NORMAL,
    LOCKDOWN,
    RECOVERING;

    companion object {
        fun fromRaw(raw: String?): SystemSecurityStatus = when (raw?.uppercase()) {
            "LOCKDOWN" -> LOCKDOWN
            "RECOVERING" -> RECOVERING
            else -> NORMAL
        }
    }
}

data class GlobalSecurityState(
    val status: SystemSecurityStatus = SystemSecurityStatus.NORMAL,
    val reasonCode: String = "SYSTEM_HEALTHY",
    val activeIncidentId: String? = null,
    val ownerApprovalRequired: Boolean = false,
    val lockdownStartedAtMs: Long? = null,
    val lastRecheckAtMs: Long? = null,
    val nextRecheckInSeconds: Int = 10,
    val restrictedActions: List<String> = emptyList(),
    val preserveUserData: Boolean = true
)
