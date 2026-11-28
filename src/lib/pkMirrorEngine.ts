/**
 * PK Chat - Mirror Sound Engine, Global Festival Greetings & Verified Location Alert Filter
 */

export interface ChatItem {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  badgeText: string;
  category: 'All' | 'Groups' | 'Calls' | 'SOS';
  online?: boolean;
  verified?: boolean;
}

export interface VerifiedDisasterAlert {
  id: string;
  title: string;
  country: string;
  provinceOrState: string;
  districtOrCity: string;
  villageOrArea: string;
  governmentSource: string;
  isOfficialVerified: boolean;
  timestamp: string;
}

export interface FestivalGreeting {
  id: string;
  occasion: string;
  message: string;
  startsOneDayPrior?: boolean;
}

export interface LocationHierarchyFilter {
  country: string;
  provinceOrState: string;
  districtOrCity: string;
  villageOrArea: string;
}

/**
 * 1. Crystal-clear WhatsApp-style original PK Chat Ringtone & Notification Tone
 * Synthesizes clean marimba + bell harmonic signature exclusive to PK Chat.
 */
export class PKChatSoundEngine {
  private ctx: AudioContext | null = null;
  private loopId: ReturnType<typeof setInterval> | null = null;

  public get isRinging(): boolean {
    return this.loopId !== null;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx && AudioCtx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playNote(freq: number, offsetSec: number, durationSec: number, volume = 0.22): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    const start = ctx.currentTime + offsetSec;
    const oscMain = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const harmGain = ctx.createGain();
    const masterGain = ctx.createGain();

    // Clean marimba + bell harmonic signature exclusive to PK Chat
    oscMain.type = 'sine';
    oscMain.frequency.setValueAtTime(freq, start);

    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.setValueAtTime(freq * 2, start);
    harmGain.gain.setValueAtTime(0.05, start);

    masterGain.gain.setValueAtTime(0.0001, start);
    masterGain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    oscMain.connect(masterGain);
    oscHarmonic.connect(harmGain);
    harmGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    oscMain.start(start);
    oscHarmonic.start(start);
    oscMain.stop(start + durationSec + 0.03);
    oscHarmonic.stop(start + durationSec + 0.03);
    return true;
  }

  public playRingCycle(): boolean {
    // Crisp, recognizable rhythmic call pattern inspired by WhatsApp clarity, unique to PK Chat
    const cadence = [587.33, 783.99, 987.77, 783.99, 1174.66];
    let anyPlayed = false;
    cadence.forEach((freq, i) => {
      if (this.playNote(freq, i * 0.13, 0.28, 0.24)) {
        anyPlayed = true;
      }
    });
    return anyPlayed;
  }

  public startIncomingRingtone(): boolean {
    this.stopIncomingRingtone();
    this.playRingCycle();
    const setTimer =
      typeof window !== 'undefined' && typeof window.setInterval === 'function'
        ? window.setInterval.bind(window)
        : setInterval;
    this.loopId = setTimer(() => {
      this.playRingCycle();
    }, 2200);
    return true;
  }

  public stopIncomingRingtone(): void {
    if (this.loopId !== null) {
      clearInterval(this.loopId);
      this.loopId = null;
    }
  }

  public playNotificationTone(): boolean {
    const first = this.playNote(659.25, 0, 0.14, 0.2);
    const second = this.playNote(1046.5, 0.12, 0.22, 0.2);
    return first || second;
  }
}

export const pkChatMirrorSound = new PKChatSoundEngine();

/**
 * 2. Global Festivals & Special Days Greeting Engine
 */
export function resolveFestivalGreetings(now = new Date()): FestivalGreeting[] {
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isOneDayBeforeNewYear = tomorrow.getMonth() + 1 === 1 && tomorrow.getDate() === 1;

  const list: FestivalGreeting[] = [];
  if (isOneDayBeforeNewYear || (month === 1 && day === 1)) {
    list.push({
      id: 'new-year',
      occasion: 'New Year',
      message: "Happy New Year! Wishing you and your family happiness and peace with God's blessings. — Prashanth Keransiya Family",
      startsOneDayPrior: true,
    });
  }
  if (month === 2 && day === 14) {
    list.push({
      id: 'lovers-day',
      occasion: "Lover's Day",
      message: "Happy Lover's Day! Wishing you and your family joy, love, and peace with God's blessings. — Prashanth Keransiya Family",
    });
  }
  if (month === 3 && day === 8) {
    list.push({
      id: 'womens-day',
      occasion: "Women's Day",
      message: "Happy Women's Day! Wishing you and your family strength, happiness, and peace with God's blessings. — Prashanth Keransiya Family",
    });
  }
  // Mother's Day (Second Sunday of May)
  if (month === 5 && now.getDay() === 0 && day >= 8 && day <= 14) {
    list.push({
      id: 'mothers-day',
      occasion: "Mother's Day",
      message: "Happy Mother's Day! Wishing you and your family endless happiness and peace with God's blessings. — Prashanth Keransiya Family",
    });
  }
  if (month === 12 && day === 25) {
    list.push({
      id: 'christmas',
      occasion: 'Christmas',
      message: "Merry Christmas! Wishing you and your family happiness and peace with God's blessings. — Prashanth Keransiya Family",
    });
  }
  return list;
}

/**
 * 3. Strictly Verified Government Disaster Alerts (Country -> Province/State -> District/City -> Village)
 */
export function getVerifiedLocationAlerts(
  alerts: VerifiedDisasterAlert[],
  location: LocationHierarchyFilter
): VerifiedDisasterAlert[] {
  const norm = (v: string) => v.trim().toLowerCase();

  return alerts.filter((a) => {
    // Only strictly verified official government messages are permitted
    if (!a.isOfficialVerified || !a.governmentSource.trim()) return false;
    if (norm(a.country) !== norm(location.country)) return false;

    const stateMatch =
      norm(a.provinceOrState) === 'all' || norm(a.provinceOrState) === norm(location.provinceOrState);
    const districtMatch =
      norm(a.districtOrCity) === 'all' || norm(a.districtOrCity) === norm(location.districtOrCity);
    const villageMatch =
      norm(a.villageOrArea) === 'all' || norm(a.villageOrArea) === norm(location.villageOrArea);

    return stateMatch && districtMatch && villageMatch;
  });
}
