import { LanguageOption } from '../types/pkchat';

/**
 * Comprehensive ISO 639-1 / ISO 639-3 & BCP-47 World Languages Registry.
 * Covers major, regional, minority, and indigenous languages plus regional variants,
 * script direction (LTR/RTL), and honest speech recognition/TTS support metadata.
 */
export const WORLD_LANGUAGES_CATALOG: LanguageOption[] = [
  // Global & Major World Languages + Regional Variants
  { code: 'en', iso639_1: 'en', iso639_3: 'eng', name: 'English', nativeName: 'English', region: 'Global', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'en-US', sttSupported: true, ttsSupported: true },
  { code: 'en-GB', iso639_1: 'en', iso639_3: 'eng', parentCode: 'en', name: 'English (United Kingdom)', nativeName: 'English (UK)', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-GB', sttSupported: true, ttsSupported: true },
  { code: 'en-IN', iso639_1: 'en', iso639_3: 'eng', parentCode: 'en', name: 'English (India & South Asia)', nativeName: 'English (India)', region: 'South Asia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-IN', sttSupported: true, ttsSupported: true },
  { code: 'en-AU', iso639_1: 'en', iso639_3: 'eng', parentCode: 'en', name: 'English (Australia)', nativeName: 'English (AU)', region: 'Oceania', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-AU', sttSupported: true, ttsSupported: true },

  { code: 'ta', iso639_1: 'ta', iso639_3: 'tam', name: 'Tamil', nativeName: 'தமிழ்', region: 'South Asia & Global', script: 'Tamil', rtl: false, category: 'major', supported: true, speechLocale: 'ta-IN', sttSupported: true, ttsSupported: true },
  { code: 'ta-LK', iso639_1: 'ta', iso639_3: 'tam', parentCode: 'ta', name: 'Tamil (Sri Lanka)', nativeName: 'தமிழ் (இலங்கை)', region: 'Sri Lanka', script: 'Tamil', rtl: false, category: 'regional', supported: true, speechLocale: 'ta-LK', sttSupported: true, ttsSupported: true },
  { code: 'ta-SG', iso639_1: 'ta', iso639_3: 'tam', parentCode: 'ta', name: 'Tamil (Singapore & Malaysia)', nativeName: 'தமிழ் (சிங்கப்பூர்)', region: 'Southeast Asia', script: 'Tamil', rtl: false, category: 'regional', supported: true, speechLocale: 'ta-SG', sttSupported: true, ttsSupported: true },

  { code: 'si', iso639_1: 'si', iso639_3: 'sin', name: 'Sinhala', nativeName: 'සිංහල', region: 'Sri Lanka', script: 'Sinhala', rtl: false, category: 'major', supported: true, speechLocale: 'si-LK', sttSupported: true, ttsSupported: true },
  { code: 'ml', iso639_1: 'ml', iso639_3: 'mal', name: 'Malayalam', nativeName: 'മലയാളം', region: 'South India', script: 'Malayalam', rtl: false, category: 'major', supported: true, speechLocale: 'ml-IN', sttSupported: true, ttsSupported: true },
  { code: 'hi', iso639_1: 'hi', iso639_3: 'hin', name: 'Hindi', nativeName: 'हिन्दी', region: 'South Asia', script: 'Devanagari', rtl: false, category: 'major', supported: true, speechLocale: 'hi-IN', sttSupported: true, ttsSupported: true },

  { code: 'ar', iso639_1: 'ar', iso639_3: 'ara', name: 'Arabic', nativeName: 'العربية', region: 'Middle East & North Africa', script: 'Arabic', rtl: true, category: 'major', supported: true, speechLocale: 'ar-SA', sttSupported: true, ttsSupported: true },
  { code: 'ar-EG', iso639_1: 'ar', iso639_3: 'arz', parentCode: 'ar', name: 'Arabic (Egypt)', nativeName: 'العربية (مصر)', region: 'North Africa', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'ar-EG', sttSupported: true, ttsSupported: true },
  { code: 'ar-AE', iso639_1: 'ar', iso639_3: 'afb', parentCode: 'ar', name: 'Arabic (Gulf / UAE)', nativeName: 'العربية (الإمارات)', region: 'Middle East', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'ar-AE', sttSupported: true, ttsSupported: true },
  { code: 'ar-MA', iso639_1: 'ar', iso639_3: 'ary', parentCode: 'ar', name: 'Arabic (Maghreb / Morocco)', nativeName: 'العربية (المغرب)', region: 'North Africa', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'ar-MA', sttSupported: true, ttsSupported: true },

  { code: 'zh', iso639_1: 'zh', iso639_3: 'zho', name: 'Chinese (Simplified Mandarin)', nativeName: '简体中文', region: 'East Asia', script: 'Han (Simplified)', rtl: false, category: 'major', supported: true, speechLocale: 'zh-CN', sttSupported: true, ttsSupported: true },
  { code: 'zh-TW', iso639_1: 'zh', iso639_3: 'zho', parentCode: 'zh', name: 'Chinese (Traditional Taiwan)', nativeName: '繁體中文 (台灣)', region: 'East Asia', script: 'Han (Traditional)', rtl: false, category: 'regional', supported: true, speechLocale: 'zh-TW', sttSupported: true, ttsSupported: true },
  { code: 'zh-HK', iso639_1: 'zh', iso639_3: 'yue', parentCode: 'zh', name: 'Chinese (Cantonese / Hong Kong)', nativeName: '廣東話 (香港)', region: 'East Asia', script: 'Han (Traditional)', rtl: false, category: 'regional', supported: true, speechLocale: 'zh-HK', sttSupported: true, ttsSupported: true },

  { code: 'ja', iso639_1: 'ja', iso639_3: 'jpn', name: 'Japanese', nativeName: '日本語', region: 'East Asia', script: 'Kanji/Kana', rtl: false, category: 'major', supported: true, speechLocale: 'ja-JP', sttSupported: true, ttsSupported: true },
  { code: 'ko', iso639_1: 'ko', iso639_3: 'kor', name: 'Korean', nativeName: '한국어', region: 'East Asia', script: 'Hangul', rtl: false, category: 'major', supported: true, speechLocale: 'ko-KR', sttSupported: true, ttsSupported: true },

  { code: 'fr', iso639_1: 'fr', iso639_3: 'fra', name: 'French', nativeName: 'Français', region: 'Europe & Global', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'fr-FR', sttSupported: true, ttsSupported: true },
  { code: 'fr-CA', iso639_1: 'fr', iso639_3: 'fra', parentCode: 'fr', name: 'French (Canada / Quebec)', nativeName: 'Français (Canada)', region: 'North America', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-CA', sttSupported: true, ttsSupported: true },

  { code: 'de', iso639_1: 'de', iso639_3: 'deu', name: 'German', nativeName: 'Deutsch', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'de-DE', sttSupported: true, ttsSupported: true },
  { code: 'de-AT', iso639_1: 'de', iso639_3: 'deu', parentCode: 'de', name: 'German (Austria)', nativeName: 'Deutsch (Österreich)', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'de-AT', sttSupported: true, ttsSupported: true },

  { code: 'es', iso639_1: 'es', iso639_3: 'spa', name: 'Spanish', nativeName: 'Español', region: 'Europe & Americas', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'es-ES', sttSupported: true, ttsSupported: true },
  { code: 'es-419', iso639_1: 'es', iso639_3: 'spa', parentCode: 'es', name: 'Spanish (Latin America)', nativeName: 'Español (Latinoamérica)', region: 'Latin America', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'es-MX', sttSupported: true, ttsSupported: true },

  { code: 'pt', iso639_1: 'pt', iso639_3: 'por', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', region: 'South America', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'pt-BR', sttSupported: true, ttsSupported: true },
  { code: 'pt-PT', iso639_1: 'pt', iso639_3: 'por', parentCode: 'pt', name: 'Portuguese (Portugal)', nativeName: 'Português (Portugal)', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'pt-PT', sttSupported: true, ttsSupported: true },

  { code: 'ru', iso639_1: 'ru', iso639_3: 'rus', name: 'Russian', nativeName: 'Русский', region: 'Eurasia', script: 'Cyrillic', rtl: false, category: 'major', supported: true, speechLocale: 'ru-RU', sttSupported: true, ttsSupported: true },

  // South Asian & Neighboring Languages
  { code: 'te', iso639_1: 'te', iso639_3: 'tel', name: 'Telugu', nativeName: 'తెలుగు', region: 'South Asia', script: 'Telugu', rtl: false, category: 'major', supported: true, speechLocale: 'te-IN', sttSupported: true, ttsSupported: true },
  { code: 'kn', iso639_1: 'kn', iso639_3: 'kan', name: 'Kannada', nativeName: 'ಕನ್ನಡ', region: 'South Asia', script: 'Kannada', rtl: false, category: 'major', supported: true, speechLocale: 'kn-IN', sttSupported: true, ttsSupported: true },
  { code: 'mr', iso639_1: 'mr', iso639_3: 'mar', name: 'Marathi', nativeName: 'मराठी', region: 'South Asia', script: 'Devanagari', rtl: false, category: 'major', supported: true, speechLocale: 'mr-IN', sttSupported: true, ttsSupported: true },
  { code: 'gu', iso639_1: 'gu', iso639_3: 'guj', name: 'Gujarati', nativeName: 'ગુજરાતી', region: 'South Asia', script: 'Gujarati', rtl: false, category: 'major', supported: true, speechLocale: 'gu-IN', sttSupported: true, ttsSupported: true },
  { code: 'bn', iso639_1: 'bn', iso639_3: 'ben', name: 'Bengali', nativeName: 'বাংলা', region: 'South Asia', script: 'Bengali', rtl: false, category: 'major', supported: true, speechLocale: 'bn-IN', sttSupported: true, ttsSupported: true },
  { code: 'bn-BD', iso639_1: 'bn', iso639_3: 'ben', parentCode: 'bn', name: 'Bengali (Bangladesh)', nativeName: 'বাংলা (বাংলাদেশ)', region: 'Bangladesh', script: 'Bengali', rtl: false, category: 'regional', supported: true, speechLocale: 'bn-BD', sttSupported: true, ttsSupported: true },
  { code: 'pa', iso639_1: 'pa', iso639_3: 'pan', name: 'Punjabi (Gurmukhi)', nativeName: 'ਪੰਜਾਬੀ', region: 'South Asia', script: 'Gurmukhi', rtl: false, category: 'major', supported: true, speechLocale: 'pa-IN', sttSupported: true, ttsSupported: true },
  { code: 'pa-PK', iso639_1: 'pa', iso639_3: 'pnb', parentCode: 'pa', name: 'Punjabi (Shahmukhi)', nativeName: 'پنجابی', region: 'Pakistan', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'ur-PK', sttSupported: true, ttsSupported: true },
  { code: 'ur', iso639_1: 'ur', iso639_3: 'urd', name: 'Urdu', nativeName: 'اردو', region: 'South Asia', script: 'Arabic', rtl: true, category: 'major', supported: true, speechLocale: 'ur-PK', sttSupported: true, ttsSupported: true },
  { code: 'or', iso639_1: 'or', iso639_3: 'ori', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', region: 'South Asia', script: 'Odia', rtl: false, category: 'regional', supported: true, speechLocale: 'or-IN', sttSupported: false, ttsSupported: true },
  { code: 'as', iso639_1: 'as', iso639_3: 'asm', name: 'Assamese', nativeName: 'অসমীয়া', region: 'South Asia', script: 'Bengali', rtl: false, category: 'regional', supported: true, speechLocale: 'as-IN', sttSupported: false, ttsSupported: true },
  { code: 'ne', iso639_1: 'ne', iso639_3: 'nep', name: 'Nepali', nativeName: 'नेपाली', region: 'Himalayas', script: 'Devanagari', rtl: false, category: 'regional', supported: true, speechLocale: 'ne-NP', sttSupported: true, ttsSupported: true },
  { code: 'sd', iso639_1: 'sd', iso639_3: 'snd', name: 'Sindhi', nativeName: 'سنڌي', region: 'South Asia', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'sd-PK', sttSupported: false, ttsSupported: true },
  { code: 'ks', iso639_1: 'ks', iso639_3: 'kas', name: 'Kashmiri', nativeName: 'कॉशुर / کٲشُر', region: 'South Asia', script: 'Perso-Arabic', rtl: true, category: 'minority', supported: true, speechLocale: 'ur-IN', sttSupported: false, ttsSupported: true },
  { code: 'kok', iso639_3: 'kok', name: 'Konkani', nativeName: 'कोंकणी', region: 'West India', script: 'Devanagari', rtl: false, category: 'minority', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'mai', iso639_3: 'mai', name: 'Maithili', nativeName: 'मैथिली', region: 'South Asia', script: 'Devanagari', rtl: false, category: 'minority', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'bho', iso639_3: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी', region: 'South Asia', script: 'Devanagari', rtl: false, category: 'regional', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'sat', iso639_3: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', region: 'South Asia', script: 'Ol Chiki', rtl: false, category: 'indigenous', supported: true, speechLocale: 'bn-IN', sttSupported: false, ttsSupported: true },
  { code: 'mni', iso639_3: 'mni', name: 'Manipuri (Meitei)', nativeName: 'ꯃꯩꯇꯩꯂꯣꯟ', region: 'Northeast India', script: 'Meetei Mayek', rtl: false, category: 'minority', supported: true, speechLocale: 'en-IN', sttSupported: false, ttsSupported: true },
  { code: 'bo', iso639_1: 'bo', iso639_3: 'bod', name: 'Tibetan', nativeName: 'བོད་ཡིག', region: 'Himalayas', script: 'Tibetan', rtl: false, category: 'minority', supported: true, speechLocale: 'zh-CN', sttSupported: false, ttsSupported: true },
  { code: 'dz', iso639_1: 'dz', iso639_3: 'dzo', name: 'Dzongkha', nativeName: 'རྫོང་ཁ', region: 'Bhutan', script: 'Tibetan', rtl: false, category: 'minority', supported: true, speechLocale: 'en-IN', sttSupported: false, ttsSupported: true },
  { code: 'dv', iso639_1: 'dv', iso639_3: 'div', name: 'Dhivehi (Maldivian)', nativeName: 'ދިވެހި', region: 'Maldives', script: 'Thaana', rtl: true, category: 'minority', supported: true, speechLocale: 'en-US', sttSupported: false, ttsSupported: true },

  // Southeast & East Asian + Pacific Languages
  { code: 'ms', iso639_1: 'ms', iso639_3: 'msa', name: 'Malay', nativeName: 'Bahasa Melayu', region: 'Southeast Asia', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'ms-MY', sttSupported: true, ttsSupported: true },
  { code: 'id', iso639_1: 'id', iso639_3: 'ind', name: 'Indonesian', nativeName: 'Bahasa Indonesia', region: 'Southeast Asia', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'id-ID', sttSupported: true, ttsSupported: true },
  { code: 'vi', iso639_1: 'vi', iso639_3: 'vie', name: 'Vietnamese', nativeName: 'Tiếng Việt', region: 'Southeast Asia', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'vi-VN', sttSupported: true, ttsSupported: true },
  { code: 'th', iso639_1: 'th', iso639_3: 'tha', name: 'Thai', nativeName: 'ไทย', region: 'Southeast Asia', script: 'Thai', rtl: false, category: 'major', supported: true, speechLocale: 'th-TH', sttSupported: true, ttsSupported: true },
  { code: 'my', iso639_1: 'my', iso639_3: 'mya', name: 'Burmese (Myanmar)', nativeName: 'မြန်မာစာ', region: 'Southeast Asia', script: 'Myanmar', rtl: false, category: 'regional', supported: true, speechLocale: 'my-MM', sttSupported: true, ttsSupported: true },
  { code: 'km', iso639_1: 'km', iso639_3: 'khm', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', region: 'Cambodia', script: 'Khmer', rtl: false, category: 'regional', supported: true, speechLocale: 'km-KH', sttSupported: true, ttsSupported: true },
  { code: 'lo', iso639_1: 'lo', iso639_3: 'lao', name: 'Lao', nativeName: 'ພາສາລາວ', region: 'Laos', script: 'Lao', rtl: false, category: 'regional', supported: true, speechLocale: 'lo-LA', sttSupported: true, ttsSupported: true },
  { code: 'fil', iso639_2: 'fil', iso639_3: 'fil', name: 'Filipino (Tagalog)', nativeName: 'Filipino', region: 'Philippines', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'fil-PH', sttSupported: true, ttsSupported: true } as LanguageOption,
  { code: 'ceb', iso639_3: 'ceb', name: 'Cebuano', nativeName: 'Binisaya', region: 'Philippines', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fil-PH', sttSupported: false, ttsSupported: true },
  { code: 'ilo', iso639_3: 'ilo', name: 'Ilocano', nativeName: 'Ilokano', region: 'Philippines', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fil-PH', sttSupported: false, ttsSupported: true },
  { code: 'jv', iso639_1: 'jv', iso639_3: 'jav', name: 'Javanese', nativeName: 'Basa Jawa', region: 'Indonesia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'jv-ID', sttSupported: true, ttsSupported: true },
  { code: 'su', iso639_1: 'su', iso639_3: 'sun', name: 'Sundanese', nativeName: 'Basa Sunda', region: 'Indonesia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'su-ID', sttSupported: true, ttsSupported: true },
  { code: 'min', iso639_3: 'min', name: 'Minangkabau', nativeName: 'Baso Minang', region: 'Indonesia', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'id-ID', sttSupported: false, ttsSupported: true },
  { code: 'mn', iso639_1: 'mn', iso639_3: 'mon', name: 'Mongolian', nativeName: 'Монгол', region: 'East Asia', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'mn-MN', sttSupported: true, ttsSupported: true },
  { code: 'haw', iso639_3: 'haw', name: 'Hawaiian', nativeName: 'ʻŌlelo Hawaiʻi', region: 'Pacific', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'en-US', sttSupported: false, ttsSupported: true },
  { code: 'mi', iso639_1: 'mi', iso639_3: 'mri', name: 'Māori', nativeName: 'Te Reo Māori', region: 'New Zealand', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'en-NZ', sttSupported: false, ttsSupported: true },
  { code: 'sm', iso639_1: 'sm', iso639_3: 'smo', name: 'Samoan', nativeName: 'Gagana Samoa', region: 'Pacific', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'en-NZ', sttSupported: false, ttsSupported: true },
  { code: 'to', iso639_1: 'to', iso639_3: 'ton', name: 'Tongan', nativeName: 'Lea Fakatonga', region: 'Pacific', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'en-NZ', sttSupported: false, ttsSupported: true },
  { code: 'fj', iso639_1: 'fj', iso639_3: 'fij', name: 'Fijian', nativeName: 'Na Vosa Vakaviti', region: 'Pacific', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'en-AU', sttSupported: false, ttsSupported: true },
  { code: 'tpi', iso639_3: 'tpi', name: 'Tok Pisin', nativeName: 'Tok Pisin', region: 'Papua New Guinea', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'en-AU', sttSupported: false, ttsSupported: true },

  // Middle East, Central Asia & Caucasus
  { code: 'he', iso639_1: 'he', iso639_3: 'heb', name: 'Hebrew', nativeName: 'עברית', region: 'Middle East', script: 'Hebrew', rtl: true, category: 'major', supported: true, speechLocale: 'he-IL', sttSupported: true, ttsSupported: true },
  { code: 'fa', iso639_1: 'fa', iso639_3: 'fas', name: 'Persian (Farsi)', nativeName: 'فارسی', region: 'Middle East', script: 'Arabic', rtl: true, category: 'major', supported: true, speechLocale: 'fa-IR', sttSupported: true, ttsSupported: true },
  { code: 'ps', iso639_1: 'ps', iso639_3: 'pus', name: 'Pashto', nativeName: 'پښتو', region: 'Central/South Asia', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'ps-AF', sttSupported: false, ttsSupported: true },
  { code: 'ku', iso639_1: 'ku', iso639_3: 'kmr', name: 'Kurdish (Kurmanji)', nativeName: 'Kurdî', region: 'Middle East', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'tr-TR', sttSupported: false, ttsSupported: true },
  { code: 'ckb', iso639_3: 'ckb', parentCode: 'ku', name: 'Kurdish (Sorani)', nativeName: 'کوردی سۆرانی', region: 'Middle East', script: 'Arabic', rtl: true, category: 'minority', supported: true, speechLocale: 'ar-IQ', sttSupported: false, ttsSupported: true },
  { code: 'ug', iso639_1: 'ug', iso639_3: 'uig', name: 'Uyghur', nativeName: 'ئۇيغۇرچە', region: 'Central Asia', script: 'Arabic', rtl: true, category: 'minority', supported: true, speechLocale: 'tr-TR', sttSupported: false, ttsSupported: true },
  { code: 'tr', iso639_1: 'tr', iso639_3: 'tur', name: 'Turkish', nativeName: 'Türkçe', region: 'Eurasia', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'tr-TR', sttSupported: true, ttsSupported: true },
  { code: 'az', iso639_1: 'az', iso639_3: 'aze', name: 'Azerbaijani', nativeName: 'Azərbaycan dili', region: 'Caucasus', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'az-AZ', sttSupported: true, ttsSupported: true },
  { code: 'uz', iso639_1: 'uz', iso639_3: 'uzb', name: 'Uzbek', nativeName: 'Oʻzbekcha', region: 'Central Asia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'uz-UZ', sttSupported: true, ttsSupported: true },
  { code: 'kk', iso639_1: 'kk', iso639_3: 'kaz', name: 'Kazakh', nativeName: 'Қазақша', region: 'Central Asia', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'kk-KZ', sttSupported: true, ttsSupported: true },
  { code: 'ky', iso639_1: 'ky', iso639_3: 'kir', name: 'Kyrgyz', nativeName: 'Кыргызча', region: 'Central Asia', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'ru-RU', sttSupported: false, ttsSupported: true },
  { code: 'tg', iso639_1: 'tg', iso639_3: 'tgk', name: 'Tajik', nativeName: 'Тоҷикӣ', region: 'Central Asia', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'ru-RU', sttSupported: false, ttsSupported: true },
  { code: 'tk', iso639_1: 'tk', iso639_3: 'tuk', name: 'Turkmen', nativeName: 'Türkmençe', region: 'Central Asia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'tr-TR', sttSupported: false, ttsSupported: true },
  { code: 'ka', iso639_1: 'ka', iso639_3: 'kat', name: 'Georgian', nativeName: 'ქართული', region: 'Caucasus', script: 'Georgian', rtl: false, category: 'regional', supported: true, speechLocale: 'ka-GE', sttSupported: true, ttsSupported: true },
  { code: 'hy', iso639_1: 'hy', iso639_3: 'hye', name: 'Armenian', nativeName: 'Հայերեն', region: 'Caucasus', script: 'Armenian', rtl: false, category: 'regional', supported: true, speechLocale: 'hy-AM', sttSupported: true, ttsSupported: true },
  { code: 'yi', iso639_1: 'yi', iso639_3: 'yid', name: 'Yiddish', nativeName: 'ייִדיש', region: 'Global', script: 'Hebrew', rtl: true, category: 'minority', supported: true, speechLocale: 'he-IL', sttSupported: false, ttsSupported: true },

  // European & Minority European Languages
  { code: 'it', iso639_1: 'it', iso639_3: 'ita', name: 'Italian', nativeName: 'Italiano', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'it-IT', sttSupported: true, ttsSupported: true },
  { code: 'nl', iso639_1: 'nl', iso639_3: 'nld', name: 'Dutch', nativeName: 'Nederlands', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'nl-NL', sttSupported: true, ttsSupported: true },
  { code: 'pl', iso639_1: 'pl', iso639_3: 'pol', name: 'Polish', nativeName: 'Polski', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'pl-PL', sttSupported: true, ttsSupported: true },
  { code: 'uk', iso639_1: 'uk', iso639_3: 'ukr', name: 'Ukrainian', nativeName: 'Українська', region: 'Europe', script: 'Cyrillic', rtl: false, category: 'major', supported: true, speechLocale: 'uk-UA', sttSupported: true, ttsSupported: true },
  { code: 'be', iso639_1: 'be', iso639_3: 'bel', name: 'Belarusian', nativeName: 'Беларуская', region: 'Europe', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'ru-RU', sttSupported: false, ttsSupported: true },
  { code: 'ro', iso639_1: 'ro', iso639_3: 'ron', name: 'Romanian', nativeName: 'Română', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'ro-RO', sttSupported: true, ttsSupported: true },
  { code: 'el', iso639_1: 'el', iso639_3: 'ell', name: 'Greek', nativeName: 'Ελληνικά', region: 'Europe', script: 'Greek', rtl: false, category: 'major', supported: true, speechLocale: 'el-GR', sttSupported: true, ttsSupported: true },
  { code: 'cs', iso639_1: 'cs', iso639_3: 'ces', name: 'Czech', nativeName: 'Čeština', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'cs-CZ', sttSupported: true, ttsSupported: true },
  { code: 'sk', iso639_1: 'sk', iso639_3: 'slk', name: 'Slovak', nativeName: 'Slovenčina', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'sk-SK', sttSupported: true, ttsSupported: true },
  { code: 'hu', iso639_1: 'hu', iso639_3: 'hun', name: 'Hungarian', nativeName: 'Magyar', region: 'Europe', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'hu-HU', sttSupported: true, ttsSupported: true },
  { code: 'bg', iso639_1: 'bg', iso639_3: 'bul', name: 'Bulgarian', nativeName: 'Български', region: 'Europe', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'bg-BG', sttSupported: true, ttsSupported: true },
  { code: 'sr', iso639_1: 'sr', iso639_3: 'srp', name: 'Serbian', nativeName: 'Српски', region: 'Europe', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'sr-RS', sttSupported: true, ttsSupported: true },
  { code: 'hr', iso639_1: 'hr', iso639_3: 'hrv', name: 'Croatian', nativeName: 'Hrvatski', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'hr-HR', sttSupported: true, ttsSupported: true },
  { code: 'bs', iso639_1: 'bs', iso639_3: 'bos', name: 'Bosnian', nativeName: 'Bosanski', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'bs-BA', sttSupported: true, ttsSupported: true },
  { code: 'sl', iso639_1: 'sl', iso639_3: 'slv', name: 'Slovenian', nativeName: 'Slovenščina', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'sl-SI', sttSupported: true, ttsSupported: true },
  { code: 'mk', iso639_1: 'mk', iso639_3: 'mkd', name: 'Macedonian', nativeName: 'Македонски', region: 'Europe', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'mk-MK', sttSupported: true, ttsSupported: true },
  { code: 'sq', iso639_1: 'sq', iso639_3: 'sqi', name: 'Albanian', nativeName: 'Shqip', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'sq-AL', sttSupported: true, ttsSupported: true },
  { code: 'sv', iso639_1: 'sv', iso639_3: 'swe', name: 'Swedish', nativeName: 'Svenska', region: 'Nordics', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'sv-SE', sttSupported: true, ttsSupported: true },
  { code: 'nb', iso639_1: 'nb', iso639_3: 'nob', name: 'Norwegian (Bokmål)', nativeName: 'Norsk bokmål', region: 'Nordics', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'nb-NO', sttSupported: true, ttsSupported: true },
  { code: 'da', iso639_1: 'da', iso639_3: 'dan', name: 'Danish', nativeName: 'Dansk', region: 'Nordics', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'da-DK', sttSupported: true, ttsSupported: true },
  { code: 'fi', iso639_1: 'fi', iso639_3: 'fin', name: 'Finnish', nativeName: 'Suomi', region: 'Nordics', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'fi-FI', sttSupported: true, ttsSupported: true },
  { code: 'is', iso639_1: 'is', iso639_3: 'isl', name: 'Icelandic', nativeName: 'Íslenska', region: 'Nordics', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'is-IS', sttSupported: true, ttsSupported: true },
  { code: 'et', iso639_1: 'et', iso639_3: 'est', name: 'Estonian', nativeName: 'Eesti', region: 'Baltics', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'et-EE', sttSupported: true, ttsSupported: true },
  { code: 'lv', iso639_1: 'lv', iso639_3: 'lav', name: 'Latvian', nativeName: 'Latviešu', region: 'Baltics', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'lv-LV', sttSupported: true, ttsSupported: true },
  { code: 'lt', iso639_1: 'lt', iso639_3: 'lit', name: 'Lithuanian', nativeName: 'Lietuvių', region: 'Baltics', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'lt-LT', sttSupported: true, ttsSupported: true },
  { code: 'ga', iso639_1: 'ga', iso639_3: 'gle', name: 'Irish', nativeName: 'Gaeilge', region: 'Europe', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'ga-IE', sttSupported: false, ttsSupported: true },
  { code: 'cy', iso639_1: 'cy', iso639_3: 'cym', name: 'Welsh', nativeName: 'Cymraeg', region: 'United Kingdom', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'cy-GB', sttSupported: false, ttsSupported: true },
  { code: 'gd', iso639_1: 'gd', iso639_3: 'gla', name: 'Scottish Gaelic', nativeName: 'Gàidhlig', region: 'Scotland', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'en-GB', sttSupported: false, ttsSupported: true },
  { code: 'eu', iso639_1: 'eu', iso639_3: 'eus', name: 'Basque', nativeName: 'Euskara', region: 'Spain/France', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'eu-ES', sttSupported: true, ttsSupported: true },
  { code: 'ca', iso639_1: 'ca', iso639_3: 'cat', name: 'Catalan', nativeName: 'Català', region: 'Spain/Andorra', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'ca-ES', sttSupported: true, ttsSupported: true },
  { code: 'gl', iso639_1: 'gl', iso639_3: 'glg', name: 'Galician', nativeName: 'Galego', region: 'Spain', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'gl-ES', sttSupported: true, ttsSupported: true },
  { code: 'mt', iso639_1: 'mt', iso639_3: 'mlt', name: 'Maltese', nativeName: 'Malti', region: 'Malta', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'mt-MT', sttSupported: false, ttsSupported: true },
  { code: 'lb', iso639_1: 'lb', iso639_3: 'ltz', name: 'Luxembourgish', nativeName: 'Lëtzebuergesch', region: 'Luxembourg', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'de-DE', sttSupported: false, ttsSupported: true },

  // African Languages
  { code: 'sw', iso639_1: 'sw', iso639_3: 'swa', name: 'Swahili', nativeName: 'Kiswahili', region: 'East Africa', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'sw-KE', sttSupported: true, ttsSupported: true },
  { code: 'am', iso639_1: 'am', iso639_3: 'amh', name: 'Amharic', nativeName: 'አማርኛ', region: 'Ethiopia', script: 'Ethiopic', rtl: false, category: 'major', supported: true, speechLocale: 'am-ET', sttSupported: true, ttsSupported: true },
  { code: 'om', iso639_1: 'om', iso639_3: 'orm', name: 'Oromo', nativeName: 'Afaan Oromoo', region: 'East Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-KE', sttSupported: false, ttsSupported: true },
  { code: 'so', iso639_1: 'so', iso639_3: 'som', name: 'Somali', nativeName: 'Soomaali', region: 'Horn of Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'so-SO', sttSupported: false, ttsSupported: true },
  { code: 'ti', iso639_1: 'ti', iso639_3: 'tir', name: 'Tigrinya', nativeName: 'ትግርኛ', region: 'Eritrea/Ethiopia', script: 'Ethiopic', rtl: false, category: 'regional', supported: true, speechLocale: 'am-ET', sttSupported: false, ttsSupported: true },
  { code: 'ha', iso639_1: 'ha', iso639_3: 'hau', name: 'Hausa', nativeName: 'Hausa', region: 'West Africa', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'ha-NG', sttSupported: false, ttsSupported: true },
  { code: 'yo', iso639_1: 'yo', iso639_3: 'yor', name: 'Yoruba', nativeName: 'Yorùbá', region: 'West Africa', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'yo-NG', sttSupported: false, ttsSupported: true },
  { code: 'ig', iso639_1: 'ig', iso639_3: 'ibo', name: 'Igbo', nativeName: 'Asụsụ Igbo', region: 'West Africa', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'en-NG', sttSupported: false, ttsSupported: true },
  { code: 'zu', iso639_1: 'zu', iso639_3: 'zul', name: 'Zulu', nativeName: 'isiZulu', region: 'South Africa', script: 'Latin', rtl: false, category: 'major', supported: true, speechLocale: 'zu-ZA', sttSupported: true, ttsSupported: true },
  { code: 'xh', iso639_1: 'xh', iso639_3: 'xho', name: 'Xhosa', nativeName: 'isiXhosa', region: 'South Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-ZA', sttSupported: false, ttsSupported: true },
  { code: 'af', iso639_1: 'af', iso639_3: 'afr', name: 'Afrikaans', nativeName: 'Afrikaans', region: 'South Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'af-ZA', sttSupported: true, ttsSupported: true },
  { code: 'st', iso639_1: 'st', iso639_3: 'sot', name: 'Sesotho', nativeName: 'Sesotho', region: 'Southern Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-ZA', sttSupported: false, ttsSupported: true },
  { code: 'sn', iso639_1: 'sn', iso639_3: 'sna', name: 'Shona', nativeName: 'chiShona', region: 'Zimbabwe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-ZA', sttSupported: false, ttsSupported: true },
  { code: 'rw', iso639_1: 'rw', iso639_3: 'kin', name: 'Kinyarwanda', nativeName: 'Ikinyarwanda', region: 'Rwanda', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-RW', sttSupported: false, ttsSupported: true },
  { code: 'lg', iso639_1: 'lg', iso639_3: 'lug', name: 'Luganda', nativeName: 'Luganda', region: 'Uganda', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-UG', sttSupported: false, ttsSupported: true },
  { code: 'ny', iso639_1: 'ny', iso639_3: 'nya', name: 'Chichewa (Nyanja)', nativeName: 'Chicheŵa', region: 'Malawi/Zambia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-MW', sttSupported: false, ttsSupported: true },
  { code: 'mg', iso639_1: 'mg', iso639_3: 'mlg', name: 'Malagasy', nativeName: 'Malagasy', region: 'Madagascar', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'wo', iso639_1: 'wo', iso639_3: 'wol', name: 'Wolof', nativeName: 'Wolof', region: 'West Africa', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'ak', iso639_1: 'ak', iso639_3: 'aka', name: 'Twi (Akan)', nativeName: 'Twi', region: 'Ghana', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-GH', sttSupported: false, ttsSupported: true },
  { code: 'ee', iso639_1: 'ee', iso639_3: 'ewe', name: 'Ewe', nativeName: 'Eʋegbe', region: 'West Africa', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'en-GH', sttSupported: false, ttsSupported: true },

  // Americas & Indigenous Languages
  { code: 'qu', iso639_1: 'qu', iso639_3: 'que', name: 'Quechua', nativeName: 'Runasimi', region: 'Andes', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'es-PE', sttSupported: false, ttsSupported: true },
  { code: 'gn', iso639_1: 'gn', iso639_3: 'grn', name: 'Guarani', nativeName: "Avañe'ẽ", region: 'South America', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'es-PY', sttSupported: false, ttsSupported: true },
  { code: 'ay', iso639_1: 'ay', iso639_3: 'aym', name: 'Aymara', nativeName: 'Aymar aru', region: 'Andes', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'es-BO', sttSupported: false, ttsSupported: true },
  { code: 'nah', iso639_3: 'nah', name: 'Nahuatl', nativeName: 'Nāhuatl', region: 'Mesoamerica', script: 'Latin', rtl: false, category: 'indigenous', supported: true, speechLocale: 'es-MX', sttSupported: false, ttsSupported: true },
  { code: 'ht', iso639_1: 'ht', iso639_3: 'hat', name: 'Haitian Creole', nativeName: 'Kreyòl ayisyen', region: 'Caribbean', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },

  // Additional Global, Regional & Classical Languages (140+ Total)
  { code: 'en-CA', iso639_1: 'en', iso639_3: 'eng', parentCode: 'en', name: 'English (Canada)', nativeName: 'English (Canada)', region: 'North America', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-CA', sttSupported: true, ttsSupported: true },
  { code: 'en-LK', iso639_1: 'en', iso639_3: 'eng', parentCode: 'en', name: 'English (Sri Lanka)', nativeName: 'English (Sri Lanka)', region: 'Sri Lanka', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-GB', sttSupported: true, ttsSupported: true },
  { code: 'fr-CH', iso639_1: 'fr', iso639_3: 'fra', parentCode: 'fr', name: 'French (Switzerland)', nativeName: 'Français (Suisse)', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-CH', sttSupported: true, ttsSupported: true },
  { code: 'de-CH', iso639_1: 'de', iso639_3: 'deu', parentCode: 'de', name: 'German (Switzerland)', nativeName: 'Deutsch (Schweiz)', region: 'Europe', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'de-CH', sttSupported: true, ttsSupported: true },
  { code: 'ms-BN', iso639_1: 'ms', iso639_3: 'msa', parentCode: 'ms', name: 'Malay (Brunei & Singapore)', nativeName: 'Bahasa Melayu (Brunei)', region: 'Southeast Asia', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'ms-MY', sttSupported: true, ttsSupported: true },
  { code: 'sa', iso639_1: 'sa', iso639_3: 'san', name: 'Sanskrit', nativeName: 'संस्कृतम्', region: 'South Asia', script: 'Devanagari', rtl: false, category: 'minority', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'prs', iso639_3: 'prs', parentCode: 'fa', name: 'Dari (Afghan Persian)', nativeName: 'دری', region: 'Central Asia', script: 'Arabic', rtl: true, category: 'regional', supported: true, speechLocale: 'fa-IR', sttSupported: false, ttsSupported: true },
  { code: 'nn', iso639_1: 'nn', iso639_3: 'nno', parentCode: 'nb', name: 'Norwegian (Nynorsk)', nativeName: 'Norsk nynorsk', region: 'Nordics', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'nb-NO', sttSupported: true, ttsSupported: true },
  { code: 'fo', iso639_1: 'fo', iso639_3: 'fao', name: 'Faroese', nativeName: 'Føroyskt', region: 'Nordics', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'da-DK', sttSupported: false, ttsSupported: true },
  { code: 'oc', iso639_1: 'oc', iso639_3: 'oci', name: 'Occitan', nativeName: 'Occitan', region: 'Europe', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'br', iso639_1: 'br', iso639_3: 'bre', name: 'Breton', nativeName: 'Brezhoneg', region: 'Europe', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'co', iso639_1: 'co', iso639_3: 'cos', name: 'Corsican', nativeName: 'Corsu', region: 'Europe', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'it-IT', sttSupported: false, ttsSupported: true },
  { code: 'fy', iso639_1: 'fy', iso639_3: 'fry', name: 'Western Frisian', nativeName: 'Frysk', region: 'Europe', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'nl-NL', sttSupported: false, ttsSupported: true },
  { code: 'tt', iso639_1: 'tt', iso639_3: 'tat', name: 'Tatar', nativeName: 'Татарча', region: 'Eurasia', script: 'Cyrillic', rtl: false, category: 'regional', supported: true, speechLocale: 'ru-RU', sttSupported: false, ttsSupported: true },
  { code: 'ba', iso639_1: 'ba', iso639_3: 'bak', name: 'Bashkir', nativeName: 'Башҡортса', region: 'Eurasia', script: 'Cyrillic', rtl: false, category: 'minority', supported: true, speechLocale: 'ru-RU', sttSupported: false, ttsSupported: true },
  { code: 'ln', iso639_1: 'ln', iso639_3: 'lin', name: 'Lingala', nativeName: 'Lingála', region: 'Central Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'tn', iso639_1: 'tn', iso639_3: 'tsn', name: 'Setswana (Tswana)', nativeName: 'Setswana', region: 'Southern Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-ZA', sttSupported: false, ttsSupported: true },
  { code: 'ts', iso639_1: 'ts', iso639_3: 'tso', name: 'Xitsonga (Tsonga)', nativeName: 'Xitsonga', region: 'Southern Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'en-ZA', sttSupported: false, ttsSupported: true },
  { code: 'rn', iso639_1: 'rn', iso639_3: 'run', name: 'Kirundi', nativeName: 'Ikirundi', region: 'East Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'bm', iso639_1: 'bm', iso639_3: 'bam', name: 'Bambara', nativeName: 'Bamanankan', region: 'West Africa', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'ff', iso639_1: 'ff', iso639_3: 'ful', name: 'Fulah (Pulaar)', nativeName: 'Fulfulde', region: 'West Africa', script: 'Latin', rtl: false, category: 'regional', supported: true, speechLocale: 'fr-FR', sttSupported: false, ttsSupported: true },
  { code: 'brx', iso639_3: 'brx', name: 'Bodo', nativeName: 'बरʼ', region: 'Northeast India', script: 'Devanagari', rtl: false, category: 'minority', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'doi', iso639_3: 'doi', name: 'Dogri', nativeName: 'डोगरी', region: 'North India', script: 'Devanagari', rtl: false, category: 'minority', supported: true, speechLocale: 'hi-IN', sttSupported: false, ttsSupported: true },
  { code: 'lus', iso639_3: 'lus', name: 'Mizo', nativeName: 'Mizo ṭawng', region: 'Northeast India', script: 'Latin', rtl: false, category: 'minority', supported: true, speechLocale: 'en-IN', sttSupported: false, ttsSupported: true },

  // Constructed / Unsupported Guardrail Examples (Never falsely marked supported)
  { code: 'eo', iso639_1: 'eo', iso639_3: 'epo', name: 'Esperanto (Unsupported Check)', nativeName: 'Esperanto', region: 'Constructed', script: 'Latin', rtl: false, category: 'unsupported', supported: false, speechLocale: 'en-US', sttSupported: false, ttsSupported: false },
  { code: 'tlh', iso639_3: 'tlh', name: 'Klingon (Unsupported Constructed)', nativeName: 'tlhIngan Hol', region: 'Fictional', script: 'Latin', rtl: false, category: 'unsupported', supported: false, speechLocale: 'en-US', sttSupported: false, ttsSupported: false },
];

export const BASE_WORLD_LANGUAGES_BY_CODE = new Map<string, LanguageOption>(
  WORLD_LANGUAGES_CATALOG.map((l) => [l.code.toLowerCase(), l])
);

export function findWorldLanguage(
  code?: string | null,
  dynamicList?: LanguageOption[]
): LanguageOption | undefined {
  if (!code) return undefined;
  const raw = code.trim().toLowerCase();
  const pool = dynamicList && dynamicList.length > 0 ? dynamicList : WORLD_LANGUAGES_CATALOG;
  const exact = pool.find((l) => l.code.toLowerCase() === raw);
  if (exact) return exact;
  const base = raw.split(/[-_]/)[0];
  return pool.find((l) => l.code.toLowerCase() === base || l.iso639_1?.toLowerCase() === base);
}

export function isSupportedWorldLanguage(
  code?: string | null,
  dynamicList?: LanguageOption[]
): boolean {
  const match = findWorldLanguage(code, dynamicList);
  return Boolean(match && match.supported);
}

export function isRtlLanguage(
  code?: string | null,
  dynamicList?: LanguageOption[]
): boolean {
  const match = findWorldLanguage(code, dynamicList);
  if (match && typeof match.rtl === 'boolean') return match.rtl;
  const base = (code || '').trim().toLowerCase().split(/[-_]/)[0];
  return ['ar', 'he', 'ur', 'fa', 'ps', 'ckb', 'sd', 'dv', 'ug', 'yi', 'ks'].includes(base);
}
