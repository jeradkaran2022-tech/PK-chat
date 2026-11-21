import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { BRAND_LOGO_URL } from '../data/constants';

interface PkUnityEmblemProps {
  size?: number;
  className?: string;
}

/**
 * Custom PK Chat Center Emblem: Globe, White Dove of Peace, and Unity Human Figures.
 */
export function PkUnityEmblemSvg({ size = 56, className = '' }: PkUnityEmblemProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PK Chat Globe, Dove and Unity Emblem"
    >
      <defs>
        <linearGradient id="pkQrGlobeGrad" x1="18" y1="18" x2="102" y2="102" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="55%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="pkQrRingGrad" x1="6" y1="6" x2="114" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#128C7E" />
        </linearGradient>
      </defs>

      {/* Outer crisp white badge backing & brand ring for high QR contrast */}
      <circle cx="60" cy="60" r="57" fill="#FFFFFF" stroke="url(#pkQrRingGrad)" strokeWidth="4" />

      {/* Globe */}
      <circle cx="60" cy="60" r="44" fill="url(#pkQrGlobeGrad)" />
      {/* Globe meridians and parallels */}
      <ellipse cx="60" cy="60" rx="22" ry="43" stroke="#BAE6FD" strokeOpacity="0.55" strokeWidth="1.8" />
      <ellipse cx="60" cy="60" rx="35" ry="43" stroke="#BAE6FD" strokeOpacity="0.35" strokeWidth="1.4" />
      <line x1="17" y1="60" x2="103" y2="60" stroke="#BAE6FD" strokeOpacity="0.55" strokeWidth="1.8" />
      <path d="M23 41 C43 47, 77 47, 97 41" stroke="#BAE6FD" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M23 79 C43 73, 77 73, 97 79" stroke="#BAE6FD" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />

      {/* Dove of Peace soaring above the globe center */}
      <path
        d="M59 42 C53 31, 41 26, 30 29 C38 35, 42 42, 46 47 C41 49, 36 53, 33 56 C41 56, 48 54, 54 51 C58 55, 65 55, 72 52 C78 49, 83 45, 89 45 C86 41, 82 39, 77 39 C79 34, 83 28, 90 24 C77 24, 67 31, 61 40 Z"
        fill="#FFFFFF"
      />
      {/* Olive leaf carried by the dove */}
      <path d="M87 44 C91 41, 95 40, 98 41 C95 44, 91 46, 87 44 Z" fill="#86EFAC" />

      {/* Three Unity Human Figures holding hands along the lower globe arc */}
      {/* Left figure */}
      <circle cx="40" cy="70" r="4.2" fill="#E0F2FE" />
      <path
        d="M32 82 C34 77, 43 77, 47 82 L44 92 L36 92 Z"
        fill="#E0F2FE"
      />
      {/* Right figure */}
      <circle cx="80" cy="70" r="4.2" fill="#E0F2FE" />
      <path
        d="M73 82 C77 77, 86 77, 88 82 L84 92 L76 92 Z"
        fill="#E0F2FE"
      />
      {/* Center figure (linked hands arc) */}
      <circle cx="60" cy="66" r="4.8" fill="#FFFFFF" />
      <path
        d="M45 79 C52 75, 68 75, 75 79"
        stroke="#FFFFFF"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M53 76 L67 76 L65 94 L55 94 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Draws the custom Globe + Dove + Human Figures emblem cleanly onto a Canvas for QR PNG export.
 */
export function drawPkUnityEmblemOnCanvas(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  badgeDiameter: number
) {
  const r = badgeDiameter / 2;
  ctx.save();
  ctx.translate(centerX, centerY);

  // Crisp white halo ring
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = Math.max(2, badgeDiameter * 0.05);
  ctx.strokeStyle = '#0284C7';
  ctx.stroke();

  // Inner Globe
  const globeR = r * 0.78;
  const grad = ctx.createLinearGradient(-globeR, -globeR, globeR, globeR);
  grad.addColorStop(0, '#38BDF8');
  grad.addColorStop(0.55, '#0284C7');
  grad.addColorStop(1, '#0369A1');
  ctx.beginPath();
  ctx.arc(0, 0, globeR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Globe grid lines
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
  ctx.lineWidth = Math.max(1, badgeDiameter * 0.02);
  ctx.beginPath();
  ctx.ellipse(0, 0, globeR * 0.48, globeR * 0.96, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-globeR * 0.95, 0);
  ctx.lineTo(globeR * 0.95, 0);
  ctx.stroke();

  // Dove silhouette above center
  const s = badgeDiameter / 120;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, -18 * s);
  ctx.bezierCurveTo(-8 * s, -31 * s, -22 * s, -35 * s, -32 * s, -31 * s);
  ctx.bezierCurveTo(-23 * s, -24 * s, -18 * s, -17 * s, -14 * s, -12 * s);
  ctx.bezierCurveTo(-20 * s, -9 * s, -25 * s, -5 * s, -28 * s, -2 * s);
  ctx.bezierCurveTo(-19 * s, -2 * s, -12 * s, -4 * s, -6 * s, -8 * s);
  ctx.bezierCurveTo(-1 * s, -3 * s, 7 * s, -3 * s, 14 * s, -7 * s);
  ctx.bezierCurveTo(21 * s, -10 * s, 26 * s, -15 * s, 32 * s, -15 * s);
  ctx.bezierCurveTo(28 * s, -19 * s, 24 * s, -21 * s, 19 * s, -21 * s);
  ctx.bezierCurveTo(22 * s, -26 * s, 26 * s, -32 * s, 32 * s, -36 * s);
  ctx.bezierCurveTo(19 * s, -35 * s, 8 * s, -28 * s, 2 * s, -19 * s);
  ctx.closePath();
  ctx.fill();

  // Three unity human figures along the bottom half
  const drawFigure = (x: number, y: number, headR: number, torsoH: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * s, y * s, headR * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect((x - 5.5) * s, (y + headR + 1.5) * s, 11 * s, torsoH * s, 4 * s);
    ctx.fill();
  };

  drawFigure(-20, 10, 4.2, 13, '#E0F2FE');
  drawFigure(20, 10, 4.2, 13, '#E0F2FE');
  drawFigure(0, 6, 4.8, 16, '#FFFFFF');

  // Linked hands arc
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, 3 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-16 * s, 19 * s);
  ctx.quadraticCurveTo(0, 14 * s, 16 * s, 19 * s);
  ctx.stroke();

  ctx.restore();
}

export function drawPkBrandLogoOnCanvas(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement | null,
  centerX: number,
  centerY: number,
  badgeDiameter: number
) {
  if (!logoImg || !logoImg.complete || logoImg.naturalWidth === 0) {
    drawPkUnityEmblemOnCanvas(ctx, centerX, centerY, badgeDiameter);
    return;
  }
  const r = badgeDiameter / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = Math.max(2, badgeDiameter * 0.05);
  ctx.strokeStyle = '#0284C7';
  ctx.stroke();

  const innerR = r * 0.88;
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerR, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logoImg, centerX - innerR, centerY - innerR, innerR * 2, innerR * 2);
  ctx.restore();
}

interface PkQrCodeGraphicProps {
  value: string;
  size?: number;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export function PkQrCodeGraphic({ value, size = 236, onCanvasReady }: PkQrCodeGraphicProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    let active = true;

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = BRAND_LOGO_URL;

    QRCode.toCanvas(
      canvas,
      value,
      {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: size,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      },
      (err) => {
        if (!active || err) return;
        const ctx = canvas.getContext('2d');
        const diameter = Math.round(canvas.width * 0.24);
        if (ctx) {
          drawPkBrandLogoOnCanvas(ctx, logoImg, canvas.width / 2, canvas.height / 2, diameter);
        }
        logoImg.onload = () => {
          if (!active) return;
          const redrawCtx = canvas.getContext('2d');
          if (redrawCtx) {
            drawPkBrandLogoOnCanvas(redrawCtx, logoImg, canvas.width / 2, canvas.height / 2, diameter);
          }
          onCanvasReady?.(canvas);
        };
        onCanvasReady?.(canvas);
      }
    );

    return () => {
      active = false;
    };
  }, [value, size, onCanvasReady]);

  const emblemSize = Math.round(size * 0.24);

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-2xl bg-white p-2.5 shadow-inner border border-[#bae6fd]"
      style={{ width: size + 20, height: size + 20 }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="block rounded-xl"
        aria-label="PK Chat Scannable QR Code"
      />
      {/* Crisp center emblem displays the official PK Chat globe, dove, and unity logo */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        {!logoImgFailed ? (
          <div
            className="rounded-full bg-white p-0.5 border-2 border-[#0284C7] shadow-md overflow-hidden"
            style={{ width: emblemSize, height: emblemSize }}
          >
            <img
              src={BRAND_LOGO_URL}
              alt="PK Chat Emblem"
              onError={() => setLogoImgFailed(true)}
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <PkUnityEmblemSvg size={emblemSize} />
        )}
      </div>
    </div>
  );
}
