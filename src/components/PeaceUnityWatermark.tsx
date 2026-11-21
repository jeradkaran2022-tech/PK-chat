import React from 'react';

interface PeaceUnityWatermarkProps {
  className?: string;
}

/**
 * Pure SVG Peace Dove & Global Humanity Unity emblem watermark.
 * Vector artwork only (no text watermarks), pointer-events disabled.
 */
export const PeaceUnityWatermark: React.FC<PeaceUnityWatermarkProps> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden z-0 ${className}`}
    >
      <svg
        viewBox="0 0 320 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-64 h-64 sm:w-80 sm:h-80 text-sky-600 dark:text-sky-400 opacity-[0.07] dark:opacity-[0.09]"
      >
        {/* Global Unity Orbit Rings */}
        <circle cx="160" cy="175" r="98" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 6" />
        <ellipse cx="160" cy="175" rx="98" ry="38" stroke="currentColor" strokeWidth="2" />
        <ellipse cx="160" cy="175" rx="44" ry="98" stroke="currentColor" strokeWidth="2" />
        <line x1="62" y1="175" x2="258" y2="175" stroke="currentColor" strokeWidth="1.75" />

        {/* Joined Humanity Unity Hands */}
        <path
          d="M78 232C98 256 128 272 160 272C192 272 222 256 242 232"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M114 252C128 260 144 264 160 264C176 264 192 260 206 252"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Peace Dove Silhouette */}
        <path
          d="M162 128C154 102 124 80 94 74C104 96 118 114 136 124C116 126 98 134 86 146C106 149 124 146 140 140C146 156 164 164 184 162C206 160 226 146 244 128C230 130 218 128 209 123C218 112 224 98 228 84C208 94 192 108 182 122C176 124 168 126 162 128Z"
          fill="currentColor"
          fillOpacity="0.45"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Olive Branch */}
        <path
          d="M236 124C250 118 264 114 276 112"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <ellipse cx="254" cy="112" rx="5" ry="2.5" transform="rotate(-25 254 112)" fill="currentColor" />
        <ellipse cx="268" cy="116" rx="5" ry="2.5" transform="rotate(15 268 116)" fill="currentColor" />
      </svg>
    </div>
  );
};
