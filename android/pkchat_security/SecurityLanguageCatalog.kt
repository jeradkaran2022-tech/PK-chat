package com.pkchat.security

data class LocalizedSecurityBannerStrings(
    val statusNormalTitle: String,
    val statusNormalBody: String,
    val statusLockdownTitle: String,
    val statusLockdownBody: String,
    val statusRecoveringTitle: String,
    val statusRecoveringBody: String,
    val recheckCountdownTemplate: String,
    val dataSafeGuarantee: String,
    val restrictedActionsLabel: String,
    val playVoiceAlertLabel: String
)

/**
 * Multi-language catalog strictly keyed by the user's explicit PK CHAT language preference
 * (ta, si, en, hi, ar, plus runtime extensions via registerLanguage).
 * Never derives language from country code.
 */
object SecurityLanguageCatalog {
    private val catalog = mutableMapOf(
        "ta" to LocalizedSecurityBannerStrings(
            statusNormalTitle = "பாதுகாப்பு நிலை: சாதாரணம்",
            statusNormalBody = "அனைத்து PK CHAT சேவைகளும் பாதுகாப்பாக இயங்குகின்றன.",
            statusLockdownTitle = "பாதுகாப்பு பூட்டுதல் செயலில்",
            statusLockdownBody = "அசாதாரண செயல்பாடு கண்டறியப்பட்டதால் உள்நுழைவு, மெசேஜ் அனுப்புதல் மற்றும் கணக்கு மாற்றங்கள் தற்காலிகமாக நிறுத்தப்பட்டுள்ளன.",
            statusRecoveringTitle = "பாதுகாப்பு மீட்பு நடைபெறுகிறது",
            statusRecoveringBody = "கணினி பாதுகாப்பு சோதனைகள் சரிபார்க்கப்பட்டு வருகின்றன. விரைவில் சாதாரண நிலைக்குத் திரும்பும்.",
            recheckCountdownTemplate = "%ds-இல் மீண்டும் சரிபார்க்கப்படும்",
            dataSafeGuarantee = "உங்கள் மெசேஜ்களும் கணக்கும் பாதுகாப்பாக உள்ளன; எதுவும் அழிக்கப்படாது.",
            restrictedActionsLabel = "நிறுத்தப்பட்டவை: உள்நுழைவு · மெசேஜ் · கணக்கு மாற்றம் · புதிய அழைப்பு",
            playVoiceAlertLabel = "குரல் அறிவிப்பு"
        ),
        "si" to LocalizedSecurityBannerStrings(
            statusNormalTitle = "ආරක්ෂක තත්ත්වය: සාමාන්‍යයි",
            statusNormalBody = "සියලුම PK CHAT සේවා ආරක්ෂිතව ක්‍රියාත්මක වේ.",
            statusLockdownTitle = "ආරක්ෂක අගුලු දැමීම සක්‍රීයයි",
            statusLockdownBody = "අසාමාන්‍ය ක්‍රියාකාරකමක් හඳුනාගත් බැවින් පිවිසීම, පණිවිඩ යැවීම සහ ගිණුම් වෙනස්කම් තාවකාලිකව සීමා කර ඇත.",
            statusRecoveringTitle = "ආරක්ෂාව යථා තත්ත්වයට පත් වෙමින් පවතී",
            statusRecoveringBody = "පද්ධති ආරක්ෂක පරීක්ෂණ සත්‍යාපනය වෙමින් පවතී. ඉක්මනින් සාමාන්‍ය තත්ත්වයට පත්වේ.",
            recheckCountdownTemplate = "තත්පර %d කින් නැවත පරීක්ෂා කෙරේ",
            dataSafeGuarantee = "ඔබගේ පණිවිඩ සහ ගිණුම සුරක්ෂිතයි; කිසිවක් මකා නොදැමේ.",
            restrictedActionsLabel = "සීමා කළ ක්‍රියා: පිවිසීම · පණිවිඩ · ගිණුම් වෙනස්කම් · ඇමතුම්",
            playVoiceAlertLabel = "හඬ ඇඟවීම"
        ),
        "en" to LocalizedSecurityBannerStrings(
            statusNormalTitle = "Security Status: Normal",
            statusNormalBody = "All PK CHAT messaging, calls, and account services are operating safely.",
            statusLockdownTitle = "Emergency Security Lockdown Active",
            statusLockdownBody = "Unusual activity was detected. Login attempts, message sending, calls, and account changes are temporarily paused.",
            statusRecoveringTitle = "Security Verification & Recovery",
            statusRecoveringBody = "Automated security checks have cleared the threat and are confirming stability before resuming service.",
            recheckCountdownTemplate = "Rechecking security status in %ds",
            dataSafeGuarantee = "Your messages and account remain safe and are never deleted during lockdown.",
            restrictedActionsLabel = "Paused: Login · Messaging · Account Edits · New Calls",
            playVoiceAlertLabel = "Play Voice Alert"
        ),
        "hi" to LocalizedSecurityBannerStrings(
            statusNormalTitle = "सुरक्षा स्थिति: सामान्य",
            statusNormalBody = "सभी PK CHAT सेवाएं सुरक्षित रूप से चल रही हैं।",
            statusLockdownTitle = "आपातकालीन सुरक्षा लॉकडाउन सक्रिय",
            statusLockdownBody = "असामान्य गतिविधि मिलने के कारण लॉगिन, संदेश भेजना और खाते में बदलाव अस्थायी रूप से रोके गए हैं।",
            statusRecoveringTitle = "सुरक्षा पुनर्प्राप्ति जारी है",
            statusRecoveringBody = "सुरक्षा जांच पूरी हो रही है। सेवा शीघ्र ही सामान्य हो जाएगी।",
            recheckCountdownTemplate = "%d सेकंड में पुनः जांच होगी",
            dataSafeGuarantee = "आपके संदेश और खाता सुरक्षित हैं; कुछ भी हटाया नहीं जाएगा।",
            restrictedActionsLabel = "रोकी गई क्रियाएँ: लॉगिन · संदेश · खाता बदलाव · कॉल",
            playVoiceAlertLabel = "वॉयस अलर्ट चलाएं"
        ),
        "ar" to LocalizedSecurityBannerStrings(
            statusNormalTitle = "حالة الأمان: طبيعية",
            statusNormalBody = "تعمل جميع خدمات المراسلة والمكالمات في PK CHAT بأمان.",
            statusLockdownTitle = "إغلاق الأمان الطارئ نشط",
            statusLockdownBody = "تم رصد نشاط غير معتاد. تم إيقاف تسجيل الدخول وإرسال الرسائل وتعديلات الحساب مؤقتاً.",
            statusRecoveringTitle = "جارٍ التحقق واستعادة الأمان",
            statusRecoveringBody = "تتحقق الفحوصات التلقائية من استقرار النظام قبل استئناف الخدمة.",
            recheckCountdownTemplate = "إعادة فحص الأمان خلال %d ثانية",
            dataSafeGuarantee = "رسائلك وحسابك في أمان ولن يتم حذف أي بيانات.",
            restrictedActionsLabel = "مقيّد مؤقتاً: الدخول · المراسلة · تعديل الحساب · المكالمات",
            playVoiceAlertLabel = "تشغيل التنبيه الصوتي"
        )
    )

    fun registerLanguage(languageCode: String, strings: LocalizedSecurityBannerStrings) {
        catalog[languageCode.trim().lowercase()] = strings
    }

    fun forPreference(preferredLanguageCode: String?): LocalizedSecurityBannerStrings {
        val normalized = preferredLanguageCode?.trim()?.lowercase()?.split('-', '_')?.firstOrNull() ?: "en"
        return catalog[normalized] ?: catalog["en"]!!
    }
}
