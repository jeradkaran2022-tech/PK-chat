import React, { useState } from 'react';
import { Heart, Share2, X } from 'lucide-react';
import tajMahalImg from '../assets/images/taj_mahal_tribute_1794778353258.jpg';

export const TAJ_MAHAL_TRIBUTE_TEXT =
  '🏛️❤️✨ தாஜ்மஹால் - காதலின் நித்திய சின்னம்! முகலாயப் பேரரசர் ஷாஜகான் தனது அன்பு மனைவி மும்தாஜ் நினைவாக எழுப்பிய இந்தக் கல்லறை, என்றும் மாறாத காதல் மற்றும் அழகுக்கு உலகளாவிய சான்றாகும். "இது ஒரு கல்லறை மட்டுமல்ல, அது காதலின் ஒரு சாகாவாகும் - இது காலத்தால் அழியாத ஒரு நினைவூட்டல்."';

const BORDER_GLOW_THEMES = [
  {
    name: 'Imperial Gold',
    borderColor: 'rgba(255, 204, 51, 0.9)',
    shadowColor: 'rgba(255, 215, 0, 0.45)',
  },
  {
    name: 'Eternal Crimson',
    borderColor: 'rgba(239, 68, 68, 0.9)',
    shadowColor: 'rgba(229, 9, 20, 0.5)',
  },
  {
    name: 'Royal Twilight',
    borderColor: 'rgba(167, 139, 250, 0.9)',
    shadowColor: 'rgba(167, 139, 250, 0.45)',
  },
];

interface TajMahalTributeModalProps {
  open: boolean;
  recipientLabel?: string;
  onClose: () => void;
  onSendLove: (messageText: string) => Promise<void> | void;
}

export function TajMahalTributeModal({
  open,
  recipientLabel,
  onClose,
  onSendLove,
}: TajMahalTributeModalProps) {
  const [borderIdx, setBorderIdx] = useState(0);
  const [customLoveNote, setCustomLoveNote] = useState('');
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  if (!open) return null;

  const theme = BORDER_GLOW_THEMES[borderIdx];
  const fullMessage = customLoveNote.trim()
    ? `${TAJ_MAHAL_TRIBUTE_TEXT} — ${customLoveNote.trim()}`
    : TAJ_MAHAL_TRIBUTE_TEXT;

  const handleShare = async () => {
    setErrorNotice(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'PK CHAT - THE ETERNAL LOVE OF TAJ MAHAL',
          text: fullMessage,
        });
        setStatusNotice('✨ தாஜ்மஹால் அன்புச் செய்தி பகிரப்பட்டது! (Shared successfully)');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullMessage);
        setStatusNotice('✨ தாஜ்மஹால் அன்புச் செய்தி நகலெடுக்கப்பட்டது! (Copied to clipboard)');
        return;
      }
      setStatusNotice('✨ தாஜ்மஹால் அன்புச் செய்தி பகிர்வுக்குத் தயாராக உள்ளது.');
    } catch {
      setStatusNotice('✨ தாஜ்மஹால் அன்புச் செய்தி பகிர்வுக்குத் தயாராக உள்ளது.');
    }
  };

  const handleSend = async () => {
    setSending(true);
    setErrorNotice(null);
    setStatusNotice(null);
    try {
      await onSendLove(fullMessage);
      setStatusNotice('❤️ உங்கள் காதல் செய்தி வெற்றிகரமாக அனுப்பப்பட்டது! (Love tribute sent)');
      setCustomLoveNote('');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Unable to send Taj Mahal tribute.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PK CHAT - The Eternal Love of Taj Mahal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[36px] bg-black text-white border border-neutral-800 shadow-[0_10px_45px_rgba(229,9,20,0.35)]">
        {/* Ambient Starlight Particles */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1px), radial-gradient(circle, rgba(229,9,20,0.2) 1px, transparent 1px)',
            backgroundSize: '28px 28px, 38px 38px',
            backgroundPosition: '0 0, 14px 14px',
          }}
        />

        {/* Header */}
        <div className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-neutral-800 bg-black/90">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold tracking-widest uppercase text-[#e50914]">
              PK CHAT
            </span>
            <span className="text-[11px] text-amber-300/80 font-medium hidden sm:inline">
              · Eternal Love of Taj Mahal
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="px-3 py-1 rounded-full border border-[#e50914] text-[#e50914] hover:bg-[#e50914]/15 text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Share2 className="w-3 h-3" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Taj Mahal Tribute"
              className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tribute Body */}
        <div className="relative z-10 px-5 py-6 flex flex-col items-center text-center space-y-5">
          {/* Interactive Circular Taj Mahal Monument Graphic */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setBorderIdx((i) => (i + 1) % BORDER_GLOW_THEMES.length)}
              title="Tap Taj Mahal to cycle border glow (Gold · Crimson · Twilight)"
              className="group focus:outline-none"
            >
              <img
                src={tajMahalImg}
                alt="Authentic Taj Mahal Monument"
                className="w-44 h-44 sm:w-48 sm:h-48 rounded-full object-cover transition-transform duration-500 group-hover:scale-105"
                style={{
                  borderWidth: '5px',
                  borderStyle: 'solid',
                  borderColor: theme.borderColor,
                  boxShadow: `0 0 32px ${theme.shadowColor}`,
                }}
              />
            </button>
            <span className="text-[10px] text-amber-300/80 font-medium">
              Tap monument frame · {theme.name} Glow
            </span>
          </div>

          {/* Gold-Bordered Tamil Tribute Card */}
          <div className="relative w-full rounded-[22px] bg-[#1a1a1a]/95 border-2 border-amber-400/60 p-6 shadow-xl space-y-3">
            <span aria-hidden="true" className="absolute top-2.5 left-3 text-sm text-amber-400/85">
              ✦
            </span>
            <span aria-hidden="true" className="absolute top-2.5 right-3 text-sm text-amber-400/85">
              ✦
            </span>
            <span aria-hidden="true" className="absolute bottom-2.5 left-3 text-sm text-amber-400/85">
              ✦
            </span>
            <span aria-hidden="true" className="absolute bottom-2.5 right-3 text-sm text-amber-400/85">
              ✦
            </span>

            <h2 className="text-xl sm:text-2xl font-bold text-[#FFD700] leading-snug">
              தாஜ்மஹால் - காதலின்
              <br />
              நித்திய சின்னம்
            </h2>

            <p className="text-sm font-medium text-[#E0E0E0]">
              உங்கள் அன்புச் செய்தி இங்கே:
            </p>

            <p className="text-xs sm:text-[13px] text-[#BDBDBD] leading-relaxed">
              முகலாயப் பேரரசர் ஷாஜகான் தனது அன்பு மனைவி மும்தாஜ் நினைவாக எழுப்பிய இந்தக் கல்லறை, என்றும் மாறாத காதல் மற்றும் அழகுக்கு உலகளாவிய சான்றாகும்.
            </p>

            <p className="text-xs sm:text-[13px] text-amber-200/90 italic leading-relaxed">
              &ldquo;இது ஒரு கல்லறை மட்டுமல்ல, அது காதலின் ஒரு சாகாவாகும் - இது காலத்தால் அழியாத ஒரு நினைவூட்டல்.&rdquo;
            </p>

            <div className="pt-1 flex items-center justify-center">
              <Heart className="w-7 h-7 text-[#e50914] fill-[#e50914] animate-pulse" />
            </div>
          </div>

          {/* Optional Personal Message */}
          <input
            type="text"
            maxLength={140}
            value={customLoveNote}
            onChange={(e) => setCustomLoveNote(e.target.value)}
            placeholder="உங்கள் தனிப்பட்ட அன்புச் செய்தி (Optional love note)..."
            className="w-full px-4 py-2.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
          />

          {recipientLabel && (
            <p className="text-[11px] text-neutral-400">
              Recipient Chat: <span className="text-white font-semibold">{recipientLabel}</span>
            </p>
          )}

          {statusNotice && (
            <div className="w-full p-2.5 rounded-2xl bg-sky-950/70 border border-sky-400/40 text-xs text-sky-200 font-medium">
              {statusNotice}
            </div>
          )}

          {errorNotice && (
            <div className="w-full p-2.5 rounded-2xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
              {errorNotice}
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSend()}
            className="w-full sm:w-auto px-9 py-3 rounded-full bg-[#e50914] hover:bg-[#f40612] disabled:opacity-50 text-white text-sm font-bold shadow-[0_6px_22px_rgba(229,9,20,0.45)] transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            <Heart className="w-4 h-4" />
            <span>{sending ? 'Sending Tribute...' : 'அன்பை அனுப்பு (Send Love)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
