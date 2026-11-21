import { synthesizeTranslatedSpeech } from './api';
import { getSecurityCopyForLanguage } from './securityTranslations';

let activeAudioEl: HTMLAudioElement | null = null;

export function stopSecurityVoiceAnnouncement() {
  if (activeAudioEl) {
    try {
      activeAudioEl.pause();
      activeAudioEl.currentTime = 0;
    } catch {
      // Ignore audio cleanup issues
    }
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cancel issues
    }
  }
}

export async function announceSecurityStatusVoice(params: {
  text: string;
  preferredLanguageCode: string;
  voiceName?: string;
  voiceAlertsEnabled?: boolean;
}): Promise<boolean> {
  if (params.voiceAlertsEnabled === false) {
    return false;
  }

  const copy = getSecurityCopyForLanguage(params.preferredLanguageCode);
  stopSecurityVoiceAnnouncement();

  // First try high-quality cloud TTS in user's selected PK CHAT language
  try {
    const res = await synthesizeTranslatedSpeech({
      text: params.text,
      voiceName: params.voiceName || 'Kore',
      languageName: copy.languageName,
    });
    if (res.audioBase64) {
      const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
      activeAudioEl = audio;
      await audio.play();
      return true;
    }
  } catch {
    // Fall back gracefully to native Web Speech API in exact selected locale
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(params.text);
      utterance.lang = copy.speechLocale;
      utterance.rate = 0.96;
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice =
        voices.find((v) => v.lang.toLowerCase() === copy.speechLocale.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(copy.languageCode.toLowerCase()));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
