import React, { useEffect, useRef, useState } from 'react';
import type { FestivalEffectKind } from '../data/festivals';
import tajMahalImg from '../assets/images/taj_mahal_tribute_1794778353258.jpg';

const TAJ_GLOW_COLORS = [
  'rgba(255, 204, 51, 0.9)',
  'rgba(239, 68, 68, 0.9)',
  'rgba(167, 139, 250, 0.9)',
];

interface FestivalCanvasOverlayProps {
  title: string;
  subtitle: string;
  effectKind: FestivalEffectKind;
  particleSymbol: string;
  floaters: string[];
  customMessage?: string | null;
  onSameToYou?: () => Promise<void> | void;
  onClose: () => void;
}

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

interface EmojiParticle {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  symbol: string;
}

interface LightDotParticle {
  x: number;
  y: number;
  radius: number;
  speed: number;
  color: string;
}

export function FestivalCanvasOverlay({
  title,
  subtitle,
  effectKind,
  particleSymbol,
  floaters,
  customMessage,
  onSameToYou,
  onClose,
}: FestivalCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tajBorderIdx, setTajBorderIdx] = useState(0);
  const [replyBusy, setReplyBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let rafId: number | null = null;

    if (effectKind === 'fireworks') {
      const particles: FireworkParticle[] = [];

      const explode = (cx: number, cy: number) => {
        if (particles.length > 260) return;
        const baseHue = Math.random() * 360;
        for (let i = 0; i < 48; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 5.5 + 1.8;
          particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1,
            color: `hsl(${(baseHue + (Math.random() * 40 - 20) + 360) % 360}, 100%, 60%)`,
          });
        }
      };

      explode(canvas.width * 0.5, canvas.height * 0.32);
      explode(canvas.width * 0.25, canvas.height * 0.25);
      explode(canvas.width * 0.75, canvas.height * 0.28);

      const renderFireworks = () => {
        ctx.fillStyle = 'rgba(11, 20, 26, 0.22)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04;
          p.alpha -= 0.018;

          if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.globalAlpha = Math.max(p.alpha, 0);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (!reducedMotion && Math.random() < 0.06) {
          explode(
            Math.random() * canvas.width * 0.8 + canvas.width * 0.1,
            Math.random() * (canvas.height * 0.55) + 40
          );
        }

        if (!reducedMotion) {
          rafId = window.requestAnimationFrame(renderFireworks);
        }
      };

      renderFireworks();
    } else if (effectKind === 'celebration_lights' || effectKind === 'lamps') {
      const palette =
        effectKind === 'lamps'
          ? ['#ffab00', '#ffd54f', '#ff6d00', '#fff8e1']
          : ['#ff0000', '#00e676', '#ffeb3b', '#ffffff'];
      const dots: LightDotParticle[] = Array.from({ length: 58 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 4 + 2,
        speed: effectKind === 'lamps' ? -(Math.random() * 1.6 + 0.6) : Math.random() * 2 + 1,
        color: palette[Math.floor(Math.random() * palette.length)],
      }));

      const renderLights = () => {
        ctx.fillStyle = 'rgba(11, 20, 26, 0.28)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const d of dots) {
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
          ctx.fill();
          d.y += d.speed;
          if (d.speed > 0 && d.y > canvas.height + 15) {
            d.y = -12;
            d.x = Math.random() * canvas.width;
          } else if (d.speed < 0 && d.y < -15) {
            d.y = canvas.height + 12;
            d.x = Math.random() * canvas.width;
          }
        }
        if (!reducedMotion) {
          rafId = window.requestAnimationFrame(renderLights);
        }
      };

      renderLights();
    } else {
      const symbolPool =
        effectKind === 'love_taj'
          ? ['🏛️', '❤️', '🌹', '✨', '💖']
          : effectKind === 'harvest'
            ? ['🌾', '✨', '🎊', '🌿']
            : effectKind === 'lanterns'
              ? particleSymbol === '🏮'
                ? ['🏮', '🧧', '🐉', '✨']
                : [particleSymbol, '✨', '🕯️', '⭐']
              : effectKind === 'sunrise'
                ? ['☀️', '🌾', '🌼', '✨']
                : effectKind === 'hearts_friendship'
                  ? [particleSymbol, '✨', '💖', '💛']
                  : [particleSymbol, ...floaters.slice(0, 2)];

      const particles: EmojiParticle[] = Array.from({ length: 42 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height * 0.3,
        size: Math.random() * 16 + 18,
        speed: effectKind === 'lanterns' ? -(Math.random() * 1.6 + 0.8) : Math.random() * 2.1 + 1.0,
        drift: Math.random() * 1.4 - 0.7,
        symbol: symbolPool[Math.floor(Math.random() * symbolPool.length)],
      }));

      const renderParticles = () => {
        ctx.fillStyle = 'rgba(11, 20, 26, 0.28)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const p of particles) {
          ctx.font = `${Math.round(p.size)}px sans-serif`;
          ctx.fillText(p.symbol, p.x, p.y);
          p.y += p.speed;
          p.x += p.drift;
          if (p.speed > 0 && p.y > canvas.height + 30) {
            p.y = -24;
            p.x = Math.random() * canvas.width;
          } else if (p.speed < 0 && p.y < -30) {
            p.y = canvas.height + 24;
            p.x = Math.random() * canvas.width;
          }
          if (p.x > canvas.width + 30) p.x = -20;
          if (p.x < -30) p.x = canvas.width + 20;
        }
        if (!reducedMotion) {
          rafId = window.requestAnimationFrame(renderParticles);
        }
      };

      renderParticles();
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [effectKind, floaters, particleSymbol]);

  const borderAccentClass =
    effectKind === 'love_taj' || effectKind === 'hearts_friendship'
      ? 'border-[#e91e63] shadow-[0_0_35px_rgba(233,30,99,0.5)]'
      : effectKind === 'lamps' || effectKind === 'sunrise'
        ? 'border-amber-400/70 shadow-[0_0_35px_rgba(251,191,36,0.4)]'
        : 'border-[#00c6ff]/50 shadow-[0_0_50px_rgba(0,198,255,0.3)]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PK Chat 3D Festival Animation"
      className="fixed inset-0 z-50 bg-[#020617]/92 backdrop-blur-2xl flex items-center justify-center p-5 text-center"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      <div
        className={`relative z-10 max-w-md w-full rounded-[28px] ${
          effectKind === 'love_taj'
            ? 'bg-[#111111]/90 backdrop-blur-2xl'
            : 'bg-[#0a192f]/80 backdrop-blur-2xl'
        } border ${borderAccentClass} p-7 space-y-4`}
      >
        {effectKind === 'love_taj' && (
          <>
            <span aria-hidden="true" className="absolute top-3 left-3 text-sm text-amber-400">✦</span>
            <span aria-hidden="true" className="absolute top-3 right-3 text-sm text-amber-400">✦</span>
            <span aria-hidden="true" className="absolute bottom-3 left-3 text-sm text-amber-400">✦</span>
            <span aria-hidden="true" className="absolute bottom-3 right-3 text-sm text-amber-400">✦</span>
          </>
        )}

        {effectKind === 'harvest' ? (
          <div className="text-4xl sm:text-5xl animate-pk-boil select-none">🌾 🎉 ✨ 🌟</div>
        ) : effectKind === 'love_taj' ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setTajBorderIdx((i) => (i + 1) % TAJ_GLOW_COLORS.length)}
              title="Tap Taj Mahal to cycle border color"
            >
              <img
                src={tajMahalImg}
                alt="Authentic Taj Mahal"
                className="w-32 h-32 sm:w-36 sm:h-36 rounded-full object-cover transition-transform duration-300 hover:scale-105"
                style={{
                  border: `4px solid ${TAJ_GLOW_COLORS[tajBorderIdx]}`,
                  boxShadow: '0 0 28px rgba(255, 215, 0, 0.45)',
                }}
              />
            </button>
            <div className="text-2xl select-none">🏛️ ❤️ ✨</div>
          </div>
        ) : effectKind === 'celebration_lights' ? (
          <div className="text-4xl sm:text-5xl select-none drop-shadow-[0_0_12px_rgba(0,198,255,0.45)]">
            ✨ 🌟 🎉 ❄️
          </div>
        ) : (
          <div className="text-4xl sm:text-5xl select-none drop-shadow-[0_0_12px_rgba(0,198,255,0.45)]">
            {floaters.join(' ')}
          </div>
        )}

        <h3
          className={`text-xl sm:text-2xl font-extrabold leading-snug ${
            effectKind === 'love_taj'
              ? 'text-[#FFD700]'
              : 'bg-gradient-to-r from-[#00c6ff] to-[#38bdf8] bg-clip-text text-transparent'
          }`}
        >
          {title}
        </h3>

        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          {customMessage?.trim() ? customMessage : subtitle}
        </p>

        {customMessage?.trim() && customMessage.trim() !== subtitle && (
          <p className="text-[11px] text-[#38bdf8]/90 leading-relaxed">
            {subtitle}
          </p>
        )}

        <div className="pt-2 flex items-center gap-3 w-full max-w-xs mx-auto">
          {onSameToYou && (
            <button
              type="button"
              disabled={replyBusy}
              onClick={async () => {
                setReplyBusy(true);
                try {
                  await onSameToYou();
                } finally {
                  setReplyBusy(false);
                }
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#38bdf8] to-[#0284c7] hover:brightness-110 disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-[0_0_16px_rgba(56,189,248,0.4)] transition-all whitespace-nowrap"
            >
              {replyBusy ? 'Sending...' : 'Same to You! 🤝'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap"
          >
            மூடு (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
