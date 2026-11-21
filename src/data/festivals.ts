export type ChatAnimationType =
  | 'lunar'
  | 'mother'
  | 'father'
  | 'love'
  | 'friend'
  | 'taj'
  | 'birthday'
  | 'fireworks'
  | 'anniversary'
  | 'sun'
  | 'miss'
  | 'snow'
  | null;

export type FestivalEffectKind =
  | 'fireworks'
  | 'fall'
  | 'love_taj'
  | 'lanterns'
  | 'sunrise'
  | 'hearts_friendship'
  | 'harvest'
  | 'celebration_lights'
  | 'lamps';

export type CelebrationCategory = 'global' | 'family' | 'milestone' | 'special';

export interface Celebration3DCard {
  id: string;
  category: CelebrationCategory;
  emoji: string;
  title: string;
  shortLabel: string;
  effectTa: string;
  animation: Exclude<ChatAnimationType, null>;
  text: string;
  gradient: string;
}

export const FESTIVAL_3D_CARDS: Celebration3DCard[] = [
  {
    id: 'fest_global_newyear',
    category: 'global',
    emoji: '🎆',
    title: 'Global New Year 🎆',
    shortLabel: 'Global New Year',
    effectTa: 'நள்ளிரவு பட்டாசு வெடித்தல்',
    animation: 'fireworks',
    text: '🎆🥂✨ இனிய ஆங்கிலப் புத்தாண்டு நல்வாழ்த்துகள்! Happy Global New Year!',
    gradient: 'from-cyan-600 via-blue-700 to-indigo-800',
  },
  {
    id: 'fest_birthday',
    category: 'milestone',
    emoji: '🎂',
    title: 'Birthday 🎂',
    shortLabel: 'Birthday',
    effectTa: 'கேக் & பலூன்கள்',
    animation: 'birthday',
    text: '🎂🎈🎉 இனிய பிறந்தநாள் நல்வாழ்த்துகள்! Happy Birthday!',
    gradient: 'from-amber-500 via-pink-500 to-purple-700',
  },
  {
    id: 'fest_anniversary',
    category: 'milestone',
    emoji: '💍',
    title: 'Anniversary 💍',
    shortLabel: 'Anniversary',
    effectTa: 'திருமண நாள் வாழ்த்து',
    animation: 'anniversary',
    text: '💍❤️✨ இனிய திருமண நாள் நல்வாழ்த்துகள்! Happy Anniversary!',
    gradient: 'from-rose-600 via-fuchsia-600 to-indigo-700',
  },
  {
    id: 'fest_mothers_day',
    category: 'family',
    emoji: '👩‍👧‍👦',
    title: 'Mothers Day 👩‍👧‍👦',
    shortLabel: 'Mothers Day',
    effectTa: 'அன்னையர் தின அன்பு',
    animation: 'mother',
    text: '👩‍👧‍👦💖🌹 அன்பான அம்மாவுக்கு இனிய அன்னையர் தின நல்வாழ்த்துகள்! Happy Mothers Day!',
    gradient: 'from-pink-600 via-rose-500 to-fuchsia-600',
  },
  {
    id: 'fest_fathers_day',
    category: 'family',
    emoji: '👨‍👧‍👦',
    title: 'Fathers Day 👨‍👧‍👦',
    shortLabel: 'Fathers Day',
    effectTa: 'தந்தையர் தின மரியாதை',
    animation: 'father',
    text: '👨‍👧‍👦💙🌟 அன்பான அப்பாவிற்கு இனிய தந்தைமார் தின நல்வாழ்த்துகள்! Happy Fathers Day!',
    gradient: 'from-blue-700 via-sky-600 to-indigo-800',
  },
  {
    id: 'fest_friendship',
    category: 'family',
    emoji: '🤝',
    title: 'Friendship Day 🤝',
    shortLabel: 'Friendship',
    effectTa: 'நட்பு நல்வாழ்த்து',
    animation: 'friend',
    text: '🤝💛✨ என் இனிய நண்பருக்கு இனிய நண்பர்கள் தின நல்வாழ்த்துகள்! Happy Friendship Day!',
    gradient: 'from-teal-600 via-emerald-600 to-cyan-700',
  },
  {
    id: 'fest_valentines',
    category: 'special',
    emoji: '❤️',
    title: 'Appreciation & Love ❤️',
    shortLabel: 'With Love',
    effectTa: 'இதயம் & அன்பு மழை',
    animation: 'love',
    text: '❤️💘🌹 அன்பான நல்வாழ்த்துகள்! Sending warmest love and appreciation!',
    gradient: 'from-rose-600 via-red-500 to-pink-600',
  },
  {
    id: 'fest_taj_mahal',
    category: 'special',
    emoji: '🏛️',
    title: 'Taj Mahal 🏛️',
    shortLabel: 'Taj Mahal',
    effectTa: 'காதலின் நித்திய சின்னம்',
    animation: 'taj',
    text: '🏛️❤️✨ தாஜ்மஹால் - காதலின் நித்திய சின்னம்! "இது காதலின் அழியாத நினைவூட்டல்."',
    gradient: 'from-neutral-900 via-rose-900 to-red-700',
  },
  {
    id: 'fest_lunar_newyear',
    category: 'global',
    emoji: '🏮',
    title: 'Lunar New Year 🏮',
    shortLabel: 'Lunar New Year',
    effectTa: 'செல்வமும் அமைதியும்',
    animation: 'lunar',
    text: '🏮✨ இனிய வசந்தகாலப் புத்தாண்டு நல்வாழ்த்துகள்! Happy Lunar New Year!',
    gradient: 'from-red-600 via-amber-500 to-rose-700',
  },
  {
    id: 'fest_good_morning',
    category: 'global',
    emoji: '☀️',
    title: 'Good Morning ☀️',
    shortLabel: 'Good Morning',
    effectTa: 'இனிய காலை வணக்கம்',
    animation: 'sun',
    text: '☀️🌤️✨ இனிய காலை வணக்கம்! Wishing you a bright and wonderful day!',
    gradient: 'from-amber-400 via-orange-400 to-yellow-500',
  },
];

export const CHAT_ANIMATION_META: Record<
  Exclude<ChatAnimationType, null>,
  {
    emoji: string;
    title: string;
    subtitle: string;
    gradient: string;
    floaters: string[];
    effectKind: FestivalEffectKind;
    particleSymbol: string;
  }
> = {
  lunar: {
    emoji: '🏮',
    title: 'Lunar New Year 🏮✨ · இனிய வசந்தகாலப் புத்தாண்டு நல்வாழ்த்துகள்!',
    subtitle: 'Wishing prosperity, joy, and bright beginnings',
    gradient: 'from-red-600 via-amber-500 to-rose-700 text-white',
    floaters: ['🏮', '✨', '🎊', '🌟'],
    effectKind: 'lanterns',
    particleSymbol: '🏮',
  },
  mother: {
    emoji: '👩‍👧‍👦',
    title: 'Mothers Day 👩‍👧‍👦💖 · இனிய அன்னையர் தின நல்வாழ்த்துகள்!',
    subtitle: 'அன்னையின் அன்பிற்கு ஈடில்லை · Celebrating every mother with love',
    gradient: 'from-pink-600 via-rose-500 to-fuchsia-600 text-white',
    floaters: ['👩‍👧‍👦', '💖', '🌹', '💐'],
    effectKind: 'hearts_friendship',
    particleSymbol: '💖',
  },
  father: {
    emoji: '👨‍👧‍👦',
    title: 'Fathers Day 👨‍👧‍👦💙 · இனிய தந்தைமார் தின நல்வாழ்த்துகள்!',
    subtitle: 'தந்தையின் வழிகாட்டலும் அன்பும் · Honoring fathers everywhere',
    gradient: 'from-blue-700 via-sky-600 to-indigo-800 text-white',
    floaters: ['👨‍👧‍👦', '💙', '🌟', '🏆'],
    effectKind: 'fall',
    particleSymbol: '💙',
  },
  love: {
    emoji: '❤️',
    title: 'Appreciation & Love ❤️🌹 · அன்பான நல்வாழ்த்துகள்!',
    subtitle: 'Warm hearts & kind wishes shared',
    gradient: 'from-rose-600 via-red-500 to-pink-600 text-white',
    floaters: ['❤️', '💘', '🌹', '✨'],
    effectKind: 'hearts_friendship',
    particleSymbol: '❤️',
  },
  friend: {
    emoji: '🤝',
    title: 'Friendship Day 🤝💛 · இனிய நண்பர்கள் தின நல்வாழ்த்துகள்!',
    subtitle: 'நல்ல நட்பு என்றென்றும் · Celebrating loyal friendship worldwide',
    gradient: 'from-teal-600 via-emerald-600 to-cyan-700 text-white',
    floaters: ['🤝', '💛', '✨', '🌟'],
    effectKind: 'hearts_friendship',
    particleSymbol: '💛',
  },
  taj: {
    emoji: '🏛️',
    title: 'Taj Mahal 🏛️❤️ · அன்பின் நித்திய சின்னம்!',
    subtitle: 'அன்பின் நித்திய சின்னமான தாஜ்மஹால் நினைவுச் செய்தி!',
    gradient: 'from-rose-500 via-pink-500 to-red-500 text-white',
    floaters: ['🏛️', '❤️', '🌹', '✨'],
    effectKind: 'love_taj',
    particleSymbol: '❤️',
  },
  birthday: {
    emoji: '🎂',
    title: 'Birthday 🎂🎈 · இனிய பிறந்தநாள் நல்வாழ்த்துகள்!',
    subtitle: 'கேக் & பலூன்கள் · Party balloons & wishes',
    gradient: 'from-amber-500 via-pink-500 to-purple-600 text-white',
    floaters: ['🎈', '🎂', '🎉', '🥳'],
    effectKind: 'fall',
    particleSymbol: '🎈',
  },
  fireworks: {
    emoji: '🎆',
    title: 'Global New Year 🎆🥂 · இனிய ஆங்கிலப் புத்தாண்டு நல்வாழ்த்துகள்!',
    subtitle: 'நள்ளிரவு பட்டாசு வெடித்தல் · Global midnight fireworks celebration',
    gradient: 'from-cyan-500 via-blue-600 to-indigo-700 text-white',
    floaters: ['🎆', '🥂', '🌟', '🎊'],
    effectKind: 'fireworks',
    particleSymbol: '🎆',
  },
  anniversary: {
    emoji: '💍',
    title: 'Anniversary 💍❤️ · இனிய திருமண நாள் நல்வாழ்த்துகள்!',
    subtitle: 'இனிய இல்லற வாழ்த்துகள் · Eternal bond & celebration',
    gradient: 'from-rose-600 via-fuchsia-600 to-indigo-700 text-white',
    floaters: ['💍', '❤️', '🥂', '✨'],
    effectKind: 'hearts_friendship',
    particleSymbol: '💍',
  },
  sun: {
    emoji: '☀️',
    title: 'Good Morning! Sun Rising...',
    subtitle: 'Bright & positive morning energy',
    gradient: 'from-amber-400 via-orange-400 to-yellow-500 text-slate-950',
    floaters: ['☀️', '🌤️', '🌻', '✨'],
    effectKind: 'sunrise',
    particleSymbol: '☀️',
  },
  miss: {
    emoji: '💭',
    title: 'Miss You! Thinking of You...',
    subtitle: 'Heartfelt remembrance shared live',
    gradient: 'from-indigo-600 via-blue-600 to-sky-600 text-white',
    floaters: ['💭', '💙', '✨', '🌙'],
    effectKind: 'fall',
    particleSymbol: '💙',
  },
  snow: {
    emoji: '❄️',
    title: 'Cold Weather! Snow Falling...',
    subtitle: 'Chilly winter breeze effect active',
    gradient: 'from-sky-500 via-cyan-600 to-blue-700 text-white',
    floaters: ['❄️', '🌨️', '☃️', '✨'],
    effectKind: 'fall',
    particleSymbol: '❄️',
  },
};

export function detectChatKeywordAnimation(text: string): ChatAnimationType {
  const lower = text.toLowerCase();
  if (lower.includes('lunar') || lower.includes('gong xi') || text.includes('வசந்தகால') || text.includes('🏮')) {
    return 'lunar';
  }
  if (lower.includes('mother') || text.includes('அன்னையர்') || text.includes('👩‍👧‍👦')) {
    return 'mother';
  }
  if (lower.includes('father') || text.includes('தந்தைமார்') || text.includes('தந்தையர்') || text.includes('👨‍👧‍👦')) {
    return 'father';
  }
  if (lower.includes('friendship') || lower.includes('friend') || text.includes('நண்பர்கள் தின') || text.includes('🤝')) {
    return 'friend';
  }
  if (lower.includes('taj mahal') || text.includes('தாஜ்மஹால்') || text.includes('🏛️')) {
    return 'taj';
  }
  if (lower.includes('anniversary') || text.includes('திருமண நாள்') || text.includes('💍')) {
    return 'anniversary';
  }
  if (
    lower.includes('valentine') ||
    lower.includes('love') ||
    text.includes('ஐ லவ் யூ') ||
    text.includes('❤️') ||
    text.includes('💖') ||
    text.includes('💘') ||
    text.includes('அன்பு')
  ) {
    return 'love';
  }
  if (
    lower.includes('new year') ||
    lower.includes('2027') ||
    text.includes('புத்தாண்டு') ||
    text.includes('🎆')
  ) {
    return 'fireworks';
  }
  if (lower.includes('birthday') || text.includes('பிறந்தநாள்') || text.includes('🎂')) {
    return 'birthday';
  }
  if (lower.includes('morning') || text.includes('குட் மார்னிங்') || lower.includes('kaalai vanakkam')) {
    return 'sun';
  }
  if (lower.includes('miss') || text.includes('மிஸ் யூ') || text.includes('நினைவு')) {
    return 'miss';
  }
  if (lower.includes('cold') || text.includes('குளிர்') || text.includes('பனி')) {
    return 'snow';
  }
  return null;
}

export function getUniversalCelebrationCards(
  category: 'all' | CelebrationCategory = 'all'
): Celebration3DCard[] {
  if (category === 'all') return FESTIVAL_3D_CARDS;
  return FESTIVAL_3D_CARDS.filter((card) => card.category === category);
}

export function getUniversalBroadcastPresets(): Array<{
  id: string;
  emoji: string;
  label: string;
  message: string;
  midnightRecommended?: boolean;
}> {
  return FESTIVAL_3D_CARDS.map((card) => ({
    id: card.id,
    emoji: card.emoji,
    label: card.title,
    message: card.text,
    midnightRecommended: card.id === 'fest_global_newyear',
  }));
}
