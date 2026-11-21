package com.pkchat.security

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun SecurityNotificationBanner(
    securityState: GlobalSecurityState,
    preferredLanguageCode: String,
    countdownSeconds: Int,
    showNormalStatusBanner: Boolean = false,
    onPlayVoiceAlert: () -> Unit
) {
    val strings = SecurityLanguageCatalog.forPreference(preferredLanguageCode)
    val shouldShow = showNormalStatusBanner || securityState.status != SystemSecurityStatus.NORMAL

    AnimatedVisibility(visible = shouldShow) {
        val (bgColor, borderColor, title, body) = when (securityState.status) {
            SystemSecurityStatus.LOCKDOWN -> Quadruple(
                Color(0xFFFEF2F2),
                Color(0xFFFCA5A5),
                strings.statusLockdownTitle,
                strings.statusLockdownBody
            )
            SystemSecurityStatus.RECOVERING -> Quadruple(
                Color(0xFFFFFBEB),
                Color(0xFFFCD34D),
                strings.statusRecoveringTitle,
                strings.statusRecoveringBody
            )
            SystemSecurityStatus.NORMAL -> Quadruple(
                Color(0xFFECFDF5),
                Color(0xFF6EE7B7),
                strings.statusNormalTitle,
                strings.statusNormalBody
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .background(bgColor, RoundedCornerShape(16.dp))
                .border(1.dp, borderColor, RoundedCornerShape(16.dp))
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF111827)
                )
                OutlinedButton(onClick = onPlayVoiceAlert) {
                    Text(
                        text = strings.playVoiceAlertLabel,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF374151)
            )

            if (securityState.status != SystemSecurityStatus.NORMAL) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = strings.restrictedActionsLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF991B1B)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${strings.dataSafeGuarantee} · ${String.format(strings.recheckCountdownTemplate, countdownSeconds)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF4B5563)
                )
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D
)
