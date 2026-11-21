package com.pkchat.security

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

class PkChatVoiceAnnouncer(context: Context) {
    private var tts: TextToSpeech? = null
    private var ready = false

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ready = (status == TextToSpeech.SUCCESS)
        }
    }

    fun speakIfEnabled(
        enabled: Boolean,
        preferredLanguageCode: String?,
        text: String
    ) {
        if (!enabled || !ready || text.isBlank()) return
        val locale = when (preferredLanguageCode?.trim()?.lowercase()) {
            "ta" -> Locale("ta", "IN")
            "si" -> Locale("si", "LK")
            "hi" -> Locale("hi", "IN")
            "ar" -> Locale("ar", "SA")
            else -> Locale.US
        }
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pkchat_sec_${System.currentTimeMillis()}")
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }
}
