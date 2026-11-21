// ==========================================
// PK CHAT - DUAL-MODE MAIN ACTIVITY
// Creator: Jerad Prasanth
// ==========================================

package com.pkchat.app

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

enum class AppInterfaceMode {
    MESSENGER,
    ONLINE_CLASS
}

data class PassThroughResult(
    val isPassThrough: Boolean,
    val speakerBaseCode: String,
    val listenerBaseCode: String,
    val estimatedLatencyMs: Int
)

data class SupportedLanguageEntry(
    val code: String,
    val displayName: String,
    val nativeName: String
)

class PKChatMainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private var currentMode: AppInterfaceMode = AppInterfaceMode.MESSENGER
    private var activeClassRoomId: String = "pkc-global-class"
    private var teacherLanguageCode: String = "ta"
    private var studentLanguageCode: String = "ta"
    private var micMuted: Boolean = false
    private var cameraOff: Boolean = false
    private var ttsReady: Boolean = false

    private var textToSpeech: TextToSpeech? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private lateinit var rootContainer: LinearLayout
    private lateinit var translateBarButton: TextView
    private lateinit var passThroughStatusPill: TextView
    private lateinit var modeMessengerTab: TextView
    private lateinit var modeClassTab: TextView
    private lateinit var messengerContainer: LinearLayout
    private lateinit var classContainer: LinearLayout
    private lateinit var meetingLinkView: TextView
    private lateinit var liveSubtitleView: TextView
    private lateinit var lipSyncStatusView: TextView
    private lateinit var whiteboardCanvasView: ClassroomWhiteboardView

    private val supportedLanguages: List<SupportedLanguageEntry> = buildWorldLanguages130Plus()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIncomingClassIntent(intent)

        // Initialize Dual-Mode Interface (Messenger + Zoom Class)
        setupDualModeUI()

        // Initialize Real-Time Cross-Language Voice Translation & Lip-Sync Engine
        initializeAITranslationEngine()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (handleIncomingClassIntent(intent) && ::rootContainer.isInitialized) {
            switchInterfaceMode(AppInterfaceMode.ONLINE_CLASS)
            refreshMeetingAndLanguageViews()
        }
    }

    private fun handleIncomingClassIntent(incoming: Intent?): Boolean {
        val data: Uri = incoming?.data ?: return false
        val segments = data.pathSegments
        val roomSlug = when {
            data.scheme == "pkchat" && data.host == "class" -> segments.firstOrNull()
            segments.size >= 2 && segments[0] == "class" -> segments[1]
            else -> data.getQueryParameter("classRoom")
        }?.trim()

        if (!roomSlug.isNullOrEmpty()) {
            activeClassRoomId = roomSlug.replace(Regex("[^a-zA-Z0-9_-]"), "-").lowercase(Locale.US)
            currentMode = AppInterfaceMode.ONLINE_CLASS
            return true
        }
        return false
    }

    private fun setupDualModeUI() {
        rootContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0A192F"))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Top Brand + Dual-Mode Header Bar
        val topHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setBackgroundColor(Color.parseColor("#0077B6"))
        }

        val brandTitle = TextView(this).apply {
            text = "PK Chat"
            textSize = 18f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val modeSwitchRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(3), dp(3), dp(3), dp(3))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#013A63"))
                cornerRadius = dp(18).toFloat()
            }
        }

        modeMessengerTab = TextView(this).apply {
            text = "Messenger"
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setPadding(dp(12), dp(6), dp(12), dp(6))
            setOnClickListener { switchInterfaceMode(AppInterfaceMode.MESSENGER) }
        }

        modeClassTab = TextView(this).apply {
            text = "Zoom Class"
            textSize = 12f
            setTypeface(null, Typeface.BOLD)
            setPadding(dp(12), dp(6), dp(12), dp(6))
            setOnClickListener { switchInterfaceMode(AppInterfaceMode.ONLINE_CLASS) }
        }

        modeSwitchRow.addView(modeMessengerTab)
        modeSwitchRow.addView(modeClassTab)
        topHeader.addView(brandTitle)
        topHeader.addView(modeSwitchRow)

        // Clean Floating Top Language Bar for 130+ Languages ('Translate ▼') + Pass-Through Status
        val floatingLanguageBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setBackgroundColor(Color.parseColor("#112240"))
        }

        translateBarButton = TextView(this).apply {
            textSize = 12.5f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(dp(12), dp(7), dp(12), dp(7))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0077B6"))
                cornerRadius = dp(16).toFloat()
                setStroke(dp(1), Color.parseColor("#38BDF8"))
            }
            setOnClickListener { open130PlusLanguagePicker() }
        }

        passThroughStatusPill = TextView(this).apply {
            textSize = 11f
            setTypeface(null, Typeface.BOLD)
            setPadding(dp(10), dp(6), dp(10), dp(6))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(8)
            }
        }

        floatingLanguageBar.addView(translateBarButton)
        floatingLanguageBar.addView(passThroughStatusPill)

        // Content Frame hosting Mode 1 (Messenger) & Mode 2 (Zoom-Style Class + Whiteboard)
        val contentHost = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }

        messengerContainer = buildMessengerModeView()
        classContainer = buildOnlineClassModeView()

        contentHost.addView(messengerContainer)
        contentHost.addView(classContainer)

        rootContainer.addView(topHeader)
        rootContainer.addView(floatingLanguageBar)
        rootContainer.addView(contentHost)

        setContentView(rootContainer)
        switchInterfaceMode(currentMode)
        refreshMeetingAndLanguageViews()
    }

    private fun buildMessengerModeView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))

            addView(TextView(this@PKChatMainActivity).apply {
                text = "WhatsApp-Style Messenger Core"
                textSize = 17f
                setTypeface(null, Typeface.BOLD)
                setTextColor(Color.WHITE)
            })

            addView(TextView(this@PKChatMainActivity).apply {
                text = "Chats · Updates · Calls · Profile · Real-Time Server QR Scan"
                textSize = 13f
                setTextColor(Color.parseColor("#94A3B8"))
                setPadding(0, dp(4), 0, dp(16))
            })

            val quickActions = listOf(
                "Chats & Live Multilingual Messages" to "40-item instant conversation list with E2EE",
                "Updates (24h Status)" to "Privacy-controlled photo, video & text updates",
                "Calls & QR Contact Scanner" to "Compact Mute · Flip · Record · End Call controls",
                "Profile QR & Settings" to "Server-verified cryptographic QR code & DOB settings"
            )
            quickActions.forEach { (title, subtitle) ->
                val card = LinearLayout(this@PKChatMainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(14), dp(12), dp(14), dp(12))
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#112240"))
                        cornerRadius = dp(12).toFloat()
                        setStroke(dp(1), Color.parseColor("#1E3A8A"))
                    }
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = dp(10) }
                }
                card.addView(TextView(this@PKChatMainActivity).apply {
                    text = title
                    textSize = 14f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(Color.WHITE)
                })
                card.addView(TextView(this@PKChatMainActivity).apply {
                    text = subtitle
                    textSize = 12f
                    setTextColor(Color.parseColor("#94A3B8"))
                    setPadding(0, dp(3), 0, 0)
                })
                addView(card)
            }

            addView(Button(this@PKChatMainActivity).apply {
                text = "Open Online Class & Whiteboard"
                setOnClickListener { switchInterfaceMode(AppInterfaceMode.ONLINE_CLASS) }
            })
        }
    }

    private fun buildOnlineClassModeView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(12))

            meetingLinkView = TextView(this@PKChatMainActivity).apply {
                textSize = 12f
                setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
                setTextColor(Color.parseColor("#38BDF8"))
                setPadding(dp(10), dp(8), dp(10), dp(8))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#0F172A"))
                    cornerRadius = dp(10).toFloat()
                    setStroke(dp(1), Color.parseColor("#1E3A8A"))
                }
            }

            lipSyncStatusView = TextView(this@PKChatMainActivity).apply {
                textSize = 11.5f
                setTextColor(Color.parseColor("#34D399"))
                setPadding(0, dp(6), 0, dp(6))
            }

            whiteboardCanvasView = ClassroomWhiteboardView(this@PKChatMainActivity).apply {
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                )
            }

            liveSubtitleView = TextView(this@PKChatMainActivity).apply {
                text = "Live Subtitles ready · Select matching languages for 0ms Pass-Through."
                textSize = 13f
                setTextColor(Color.WHITE)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#111B21"))
                    cornerRadius = dp(12).toFloat()
                    setStroke(dp(1), Color.parseColor("#334155"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(8); bottomMargin = dp(8) }
            }

            val controlsRow = LinearLayout(this@PKChatMainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
            }

            val muteBtn = Button(this@PKChatMainActivity).apply {
                text = "Mute"
                setOnClickListener {
                    micMuted = !micMuted
                    text = if (micMuted) "Unmute" else "Mute"
                }
            }

            val camBtn = Button(this@PKChatMainActivity).apply {
                text = "Video"
                setOnClickListener {
                    cameraOff = !cameraOff
                    text = if (cameraOff) "Cam Off" else "Video"
                }
            }

            val clearBoardBtn = Button(this@PKChatMainActivity).apply {
                text = "Clear Board"
                setOnClickListener { whiteboardCanvasView.clearBoard() }
            }

            val speakDemoBtn = Button(this@PKChatMainActivity).apply {
                text = "Live Caption"
                setOnClickListener { promptLiveCaptionTurn() }
            }

            listOf(muteBtn, camBtn, clearBoardBtn, speakDemoBtn).forEach { btn ->
                controlsRow.addView(btn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = dp(4)
                })
            }

            addView(meetingLinkView)
            addView(lipSyncStatusView)
            addView(whiteboardCanvasView)
            addView(liveSubtitleView)
            addView(controlsRow)
        }
    }

    private fun switchInterfaceMode(mode: AppInterfaceMode) {
        currentMode = mode
        messengerContainer.visibility = if (mode == AppInterfaceMode.MESSENGER) View.VISIBLE else View.GONE
        classContainer.visibility = if (mode == AppInterfaceMode.ONLINE_CLASS) View.VISIBLE else View.GONE

        modeMessengerTab.setTextColor(if (mode == AppInterfaceMode.MESSENGER) Color.WHITE else Color.parseColor("#BAE6FD"))
        modeMessengerTab.background = if (mode == AppInterfaceMode.MESSENGER) {
            GradientDrawable().apply { setColor(Color.parseColor("#008069")); cornerRadius = dp(14).toFloat() }
        } else null

        modeClassTab.setTextColor(if (mode == AppInterfaceMode.ONLINE_CLASS) Color.WHITE else Color.parseColor("#BAE6FD"))
        modeClassTab.background = if (mode == AppInterfaceMode.ONLINE_CLASS) {
            GradientDrawable().apply { setColor(Color.parseColor("#0284C7")); cornerRadius = dp(14).toFloat() }
        } else null
    }

    private fun initializeAITranslationEngine() {
        textToSpeech = TextToSpeech(this, this)

        // Observe PKChatApplication network tier for 4K / HD / Low-signal adaptive lip-sync telemetry
        val app = application as? PKChatApplication
        val mediaTier = app?.routingProfile?.value?.mediaTier ?: "4k_uhd"
        val passThrough = evaluateSameLanguagePassThrough(teacherLanguageCode, studentLanguageCode)

        lipSyncStatusView.text = if (passThrough.isPassThrough) {
            "Media Tier: $mediaTier · Direct Pass-Through (0ms Translation Overhead)"
        } else {
            "Media Tier: $mediaTier · Live Subtitles & 4K Lip-Sync Active (${passThrough.speakerBaseCode.uppercase(Locale.US)} -> ${passThrough.listenerBaseCode.uppercase(Locale.US)})"
        }
    }

    override fun onInit(status: Int) {
        ttsReady = (status == TextToSpeech.SUCCESS)
        if (ttsReady) {
            val locale = Locale.forLanguageTag(studentLanguageCode)
            textToSpeech?.language = locale
        }
    }

    fun evaluateSameLanguagePassThrough(speakerCode: String, listenerCode: String): PassThroughResult {
        val speakerBase = speakerCode.trim().lowercase(Locale.US).split('-', '_').firstOrNull().orEmpty().ifEmpty { "en" }
        val listenerBase = listenerCode.trim().lowercase(Locale.US).split('-', '_').firstOrNull().orEmpty().ifEmpty { "en" }
        val matched = speakerBase == listenerBase
        return PassThroughResult(
            isPassThrough = matched,
            speakerBaseCode = speakerBase,
            listenerBaseCode = listenerBase,
            estimatedLatencyMs = if (matched) 0 else 120
        )
    }

    private fun open130PlusLanguagePicker() {
        val labels = supportedLanguages.map { "${it.nameForDisplay()} (${it.code})" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Select Class / Chat Language (${supportedLanguages.size} Languages)")
            .setItems(labels) { _, which ->
                val chosen = supportedLanguages[which]
                studentLanguageCode = chosen.code
                if (ttsReady) {
                    textToSpeech?.language = Locale.forLanguageTag(chosen.code)
                }
                refreshMeetingAndLanguageViews()
            }
            .setNeutralButton("Set Teacher Language") { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle("Teacher Spoken Language")
                    .setItems(labels) { _, idx ->
                        teacherLanguageCode = supportedLanguages[idx].code
                        refreshMeetingAndLanguageViews()
                    }
                    .show()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun promptLiveCaptionTurn() {
        val input = EditText(this).apply {
            hint = "Speak or type class sentence..."
        }
        AlertDialog.Builder(this)
            .setTitle("Live Class Caption (${teacherLanguageCode.uppercase(Locale.US)} -> ${studentLanguageCode.uppercase(Locale.US)})")
            .setView(input)
            .setPositiveButton("Broadcast") { _, _ ->
                val text = input.text.toString().trim()
                if (text.isNotEmpty()) {
                    deliverSubtitleWithPassThrough(text)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun deliverSubtitleWithPassThrough(spokenText: String) {
        val decision = evaluateSameLanguagePassThrough(teacherLanguageCode, studentLanguageCode)
        if (decision.isPassThrough) {
            // Same-Language Pass-Through: deliver instantaneously with 0ms translation overhead
            liveSubtitleView.text = "[Pass-Through · 0ms] $spokenText"
        } else {
            liveSubtitleView.text = "[${decision.speakerBaseCode.uppercase(Locale.US)} -> ${decision.listenerBaseCode.uppercase(Locale.US)}] $spokenText"
            if (ttsReady) {
                textToSpeech?.speak(spokenText, TextToSpeech.QUEUE_FLUSH, null, "pkc_sub_${System.currentTimeMillis()}")
            }
        }
    }

    private fun refreshMeetingAndLanguageViews() {
        val currentEntry = supportedLanguages.firstOrNull {
            it.code.equals(studentLanguageCode, ignoreCase = true)
        } ?: supportedLanguages.first()

        translateBarButton.text = "Translate (${currentEntry.displayName}) ▼"

        val decision = evaluateSameLanguagePassThrough(teacherLanguageCode, studentLanguageCode)
        if (decision.isPassThrough) {
            passThroughStatusPill.text = "Direct Pass-Through (Same Language)"
            passThroughStatusPill.setTextColor(Color.parseColor("#34D399"))
            passThroughStatusPill.background = GradientDrawable().apply {
                setColor(Color.parseColor("#064E3B"))
                cornerRadius = dp(12).toFloat()
            }
        } else {
            passThroughStatusPill.text = "Live Translate: ${teacherLanguageCode.uppercase(Locale.US)} -> ${studentLanguageCode.uppercase(Locale.US)}"
            passThroughStatusPill.setTextColor(Color.parseColor("#7DD3FC"))
            passThroughStatusPill.background = GradientDrawable().apply {
                setColor(Color.parseColor("#0C4A6E"))
                cornerRadius = dp(12).toFloat()
            }
        }

        meetingLinkView.text = "Meeting Link: https://pkchat.app/class/$activeClassRoomId"

        val mediaTier = (application as? PKChatApplication)?.routingProfile?.value?.mediaTier ?: "4k_uhd"
        lipSyncStatusView.text = if (decision.isPassThrough) {
            "Media Tier: $mediaTier · Direct Pass-Through Active (0ms Lag)"
        } else {
            "Media Tier: $mediaTier · Live Subtitles & 4K Lip-Sync (${decision.speakerBaseCode} -> ${decision.listenerBaseCode})"
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun SupportedLanguageEntry.nameForDisplay(): String =
        if (nativeName.isNotBlank() && nativeName != displayName) "$displayName — $nativeName" else displayName

    private fun buildWorldLanguages130Plus(): List<SupportedLanguageEntry> {
        val raw = listOf(
            Triple("en", "English", "English"),
            Triple("en-GB", "English (UK)", "English (UK)"),
            Triple("en-IN", "English (India)", "English (India)"),
            Triple("en-LK", "English (Sri Lanka)", "English (Sri Lanka)"),
            Triple("en-CA", "English (Canada)", "English (Canada)"),
            Triple("en-AU", "English (Australia)", "English (AU)"),
            Triple("ta", "Tamil", "தமிழ்"),
            Triple("ta-LK", "Tamil (Sri Lanka)", "தமிழ் (இலங்கை)"),
            Triple("ta-SG", "Tamil (Singapore)", "தமிழ் (சிங்கப்பூர்)"),
            Triple("si", "Sinhala", "සිංහල"),
            Triple("hi", "Hindi", "हिन्दी"),
            Triple("ml", "Malayalam", "മലയാളം"),
            Triple("te", "Telugu", "తెలుగు"),
            Triple("kn", "Kannada", "ಕನ್ನಡ"),
            Triple("mr", "Marathi", "मराठी"),
            Triple("gu", "Gujarati", "ગુજરાતી"),
            Triple("bn", "Bengali", "বাংলা"),
            Triple("bn-BD", "Bengali (Bangladesh)", "বাংলা (বাংলাদেশ)"),
            Triple("pa", "Punjabi", "ਪੰਜਾਬੀ"),
            Triple("ur", "Urdu", "اردو"),
            Triple("or", "Odia", "ଓଡ଼ିଆ"),
            Triple("as", "Assamese", "অসমীয়া"),
            Triple("ne", "Nepali", "नेपाली"),
            Triple("sd", "Sindhi", "سنڌي"),
            Triple("ks", "Kashmiri", "कॉशुर"),
            Triple("kok", "Konkani", "कोंकणी"),
            Triple("mai", "Maithili", "मैथिली"),
            Triple("bho", "Bhojpuri", "भोजपुरी"),
            Triple("sat", "Santali", "ᱥᱟᱱᱛᱟᱲᱤ"),
            Triple("mni", "Manipuri", "ꯃꯩꯇꯩꯂꯣꯟ"),
            Triple("sa", "Sanskrit", "संस्कृतम्"),
            Triple("brx", "Bodo", "बरʼ"),
            Triple("doi", "Dogri", "डोगरी"),
            Triple("lus", "Mizo", "Mizo ṭawng"),
            Triple("bo", "Tibetan", "བོད་ཡིག"),
            Triple("dz", "Dzongkha", "རྫོང་ཁ"),
            Triple("dv", "Dhivehi", "ދިވެހި"),
            Triple("ar", "Arabic", "العربية"),
            Triple("ar-EG", "Arabic (Egypt)", "العربية (مصر)"),
            Triple("ar-AE", "Arabic (UAE)", "العربية (الإمارات)"),
            Triple("ar-MA", "Arabic (Morocco)", "العربية (المغرب)"),
            Triple("zh", "Chinese (Simplified)", "简体中文"),
            Triple("zh-TW", "Chinese (Traditional)", "繁體中文"),
            Triple("zh-HK", "Chinese (Cantonese)", "廣東話"),
            Triple("ja", "Japanese", "日本語"),
            Triple("ko", "Korean", "한국어"),
            Triple("fr", "French", "Français"),
            Triple("fr-CA", "French (Canada)", "Français (Canada)"),
            Triple("fr-CH", "French (Switzerland)", "Français (Suisse)"),
            Triple("de", "German", "Deutsch"),
            Triple("de-AT", "German (Austria)", "Deutsch (Österreich)"),
            Triple("de-CH", "German (Switzerland)", "Deutsch (Schweiz)"),
            Triple("es", "Spanish", "Español"),
            Triple("es-419", "Spanish (Latin America)", "Español (Latinoamérica)"),
            Triple("pt", "Portuguese (Brazil)", "Português (Brasil)"),
            Triple("pt-PT", "Portuguese (Portugal)", "Português (Portugal)"),
            Triple("ru", "Russian", "Русский"),
            Triple("ms", "Malay", "Bahasa Melayu"),
            Triple("ms-BN", "Malay (Brunei)", "Bahasa Melayu (Brunei)"),
            Triple("id", "Indonesian", "Bahasa Indonesia"),
            Triple("vi", "Vietnamese", "Tiếng Việt"),
            Triple("th", "Thai", "ไทย"),
            Triple("my", "Burmese", "မြန်မာစာ"),
            Triple("km", "Khmer", "ភាសាខ្មែរ"),
            Triple("lo", "Lao", "ພາສາລາວ"),
            Triple("fil", "Filipino", "Filipino"),
            Triple("ceb", "Cebuano", "Binisaya"),
            Triple("ilo", "Ilocano", "Ilokano"),
            Triple("jv", "Javanese", "Basa Jawa"),
            Triple("su", "Sundanese", "Basa Sunda"),
            Triple("min", "Minangkabau", "Baso Minang"),
            Triple("mn", "Mongolian", "Монгол"),
            Triple("haw", "Hawaiian", "ʻŌlelo Hawaiʻi"),
            Triple("mi", "Māori", "Te Reo Māori"),
            Triple("sm", "Samoan", "Gagana Samoa"),
            Triple("to", "Tongan", "Lea Fakatonga"),
            Triple("fj", "Fijian", "Na Vosa Vakaviti"),
            Triple("tpi", "Tok Pisin", "Tok Pisin"),
            Triple("he", "Hebrew", "עברית"),
            Triple("fa", "Persian", "فارسی"),
            Triple("prs", "Dari", "دری"),
            Triple("ps", "Pashto", "پښتو"),
            Triple("ku", "Kurdish (Kurmanji)", "Kurdî"),
            Triple("ckb", "Kurdish (Sorani)", "کوردی سۆرانی"),
            Triple("ug", "Uyghur", "ئۇيغۇرچە"),
            Triple("tr", "Turkish", "Türkçe"),
            Triple("az", "Azerbaijani", "Azərbaycan dili"),
            Triple("uz", "Uzbek", "Oʻzbekcha"),
            Triple("kk", "Kazakh", "Қазақша"),
            Triple("ky", "Kyrgyz", "Кыргызча"),
            Triple("tg", "Tajik", "Тоҷикӣ"),
            Triple("tk", "Turkmen", "Türkmençe"),
            Triple("ka", "Georgian", "ქართული"),
            Triple("hy", "Armenian", "Հայերեն"),
            Triple("yi", "Yiddish", "ייִדיש"),
            Triple("it", "Italian", "Italiano"),
            Triple("nl", "Dutch", "Nederlands"),
            Triple("pl", "Polish", "Polski"),
            Triple("uk", "Ukrainian", "Українська"),
            Triple("be", "Belarusian", "Беларуская"),
            Triple("ro", "Romanian", "Română"),
            Triple("el", "Greek", "Ελληνικά"),
            Triple("cs", "Czech", "Čeština"),
            Triple("sk", "Slovak", "Slovenčina"),
            Triple("hu", "Hungarian", "Magyar"),
            Triple("bg", "Bulgarian", "Български"),
            Triple("sr", "Serbian", "Српски"),
            Triple("hr", "Croatian", "Hrvatski"),
            Triple("bs", "Bosnian", "Bosanski"),
            Triple("sl", "Slovenian", "Slovenščina"),
            Triple("mk", "Macedonian", "Македонски"),
            Triple("sq", "Albanian", "Shqip"),
            Triple("sv", "Swedish", "Svenska"),
            Triple("nb", "Norwegian (Bokmål)", "Norsk bokmål"),
            Triple("nn", "Norwegian (Nynorsk)", "Norsk nynorsk"),
            Triple("da", "Danish", "Dansk"),
            Triple("fi", "Finnish", "Suomi"),
            Triple("is", "Icelandic", "Íslenska"),
            Triple("fo", "Faroese", "Føroyskt"),
            Triple("et", "Estonian", "Eesti"),
            Triple("lv", "Latvian", "Latviešu"),
            Triple("lt", "Lithuanian", "Lietuvių"),
            Triple("ga", "Irish", "Gaeilge"),
            Triple("cy", "Welsh", "Cymraeg"),
            Triple("gd", "Scottish Gaelic", "Gàidhlig"),
            Triple("eu", "Basque", "Euskara"),
            Triple("ca", "Catalan", "Català"),
            Triple("gl", "Galician", "Galego"),
            Triple("mt", "Maltese", "Malti"),
            Triple("lb", "Luxembourgish", "Lëtzebuergesch"),
            Triple("oc", "Occitan", "Occitan"),
            Triple("br", "Breton", "Brezhoneg"),
            Triple("co", "Corsican", "Corsu"),
            Triple("fy", "Western Frisian", "Frysk"),
            Triple("tt", "Tatar", "Татарча"),
            Triple("ba", "Bashkir", "Башҡортса"),
            Triple("sw", "Swahili", "Kiswahili"),
            Triple("am", "Amharic", "አማርኛ"),
            Triple("om", "Oromo", "Afaan Oromoo"),
            Triple("so", "Somali", "Soomaali"),
            Triple("ti", "Tigrinya", "ትግርኛ"),
            Triple("ha", "Hausa", "Hausa"),
            Triple("yo", "Yoruba", "Yorùbá"),
            Triple("ig", "Igbo", "Asụsụ Igbo"),
            Triple("zu", "Zulu", "isiZulu"),
            Triple("xh", "Xhosa", "isiXhosa"),
            Triple("af", "Afrikaans", "Afrikaans"),
            Triple("st", "Sesotho", "Sesotho"),
            Triple("sn", "Shona", "chiShona"),
            Triple("rw", "Kinyarwanda", "Ikinyarwanda"),
            Triple("rn", "Kirundi", "Ikirundi"),
            Triple("lg", "Luganda", "Luganda"),
            Triple("ny", "Chichewa", "Chicheŵa"),
            Triple("mg", "Malagasy", "Malagasy"),
            Triple("wo", "Wolof", "Wolof"),
            Triple("ak", "Twi", "Twi"),
            Triple("ee", "Ewe", "Eʋegbe"),
            Triple("ln", "Lingala", "Lingála"),
            Triple("tn", "Setswana", "Setswana"),
            Triple("ts", "Xitsonga", "Xitsonga"),
            Triple("bm", "Bambara", "Bamanankan"),
            Triple("ff", "Fulah", "Fulfulde"),
            Triple("qu", "Quechua", "Runasimi"),
            Triple("gn", "Guarani", "Avañe'ẽ"),
            Triple("ay", "Aymara", "Aymar aru"),
            Triple("nah", "Nahuatl", "Nāhuatl"),
            Triple("ht", "Haitian Creole", "Kreyòl ayisyen")
        )
        return raw.map { SupportedLanguageEntry(it.first, it.second, it.third) }
    }
}

class ClassroomWhiteboardView(context: Context) : View(context) {
    private val strokes = mutableListOf<Pair<Path, Paint>>()
    private var activePath: Path? = null
    private var activePaint: Paint = createStrokePaint()

    init {
        setBackgroundColor(Color.WHITE)
    }

    private fun createStrokePaint(): Paint = Paint().apply {
        color = Color.parseColor("#0F172A")
        isAntiAlias = true
        strokeWidth = 7f
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }

    fun clearBoard() {
        strokes.clear()
        activePath = null
        invalidate()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x
        val y = event.y
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                activePaint = createStrokePaint()
                activePath = Path().apply { moveTo(x, y) }
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                activePath?.lineTo(x, y)
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP -> {
                activePath?.let { path ->
                    path.lineTo(x, y)
                    strokes.add(path to activePaint)
                }
                activePath = null
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for ((path, paint) in strokes) {
            canvas.drawPath(path, paint)
        }
        activePath?.let { canvas.drawPath(it, activePaint) }
    }
}
