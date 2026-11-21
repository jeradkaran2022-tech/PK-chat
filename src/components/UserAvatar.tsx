import React, { useEffect, useState } from 'react';
import { Ban, User, Users } from 'lucide-react';
import { BRAND_LOGO_URL } from '../data/constants';

export function sanitizeUserAvatarUrl(src?: string | null): string {
  if (!src) return '';
  const trimmed = src.trim();
  if (
    !trimmed ||
    trimmed === BRAND_LOGO_URL ||
    trimmed.includes('pk-chat-logo') ||
    trimmed.includes('WhatsApp_Image_2026-11-14') ||
    trimmed.includes('WhatsApp_Image_2026-11-18_at_4.59.42_PM_e151f1c5')
  ) {
    return '';
  }
  return trimmed;
}

const AVATAR_TONES = [
  'bg-[#0284c7] text-white',
  'bg-sky-700 text-white',
  'bg-blue-700 text-white',
  'bg-indigo-700 text-white',
  'bg-cyan-700 text-white',
  'bg-slate-700 text-white',
];

function getInitials(name?: string): string {
  const clean = (name || '').trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function getToneClass(name?: string): string {
  const clean = name || 'PK';
  let sum = 0;
  for (let i = 0; i < clean.length; i++) {
    sum = (sum + clean.charCodeAt(i)) % AVATAR_TONES.length;
  }
  return AVATAR_TONES[sum];
}

const SIZE_CLASSES: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

export function UserAvatar({
  src,
  name,
  size = 'md',
  isGroup = false,
  blocked = false,
  className = '',
}: {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isGroup?: boolean;
  blocked?: boolean;
  className?: string;
}) {
  const cleanSrc = sanitizeUserAvatarUrl(src);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [cleanSrc]);

  const sizeCls = SIZE_CLASSES[size];

  if (blocked) {
    return (
      <div
        className={`${sizeCls} rounded-full bg-slate-200 dark:bg-slate-800 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold shrink-0 border border-slate-300 dark:border-slate-700 ${className}`}
        aria-label={name ? `${name} (Blocked)` : 'Blocked user'}
      >
        <Ban className="w-4 h-4" />
      </div>
    );
  }

  if (cleanSrc && !imgFailed) {
    return (
      <img
        src={cleanSrc}
        alt={name || 'Profile avatar'}
        onError={() => setImgFailed(true)}
        className={`${sizeCls} rounded-full object-cover shrink-0 border border-slate-200/80 dark:border-slate-700/80 ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  if (isGroup) {
    return (
      <div
        className={`${sizeCls} rounded-full bg-teal-700 text-white flex items-center justify-center font-bold shrink-0 border border-white/20 ${className}`}
        aria-label={name || 'Group chat'}
      >
        <Users className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
      </div>
    );
  }

  const initials = getInitials(name);
  const toneCls = getToneClass(name);

  return (
    <div
      className={`${sizeCls} rounded-full ${toneCls} flex items-center justify-center font-bold shrink-0 border border-white/20 select-none ${className}`}
      aria-label={name || 'User profile'}
    >
      {initials || <User className={size === 'xl' ? 'w-10 h-10' : 'w-4 h-4'} />}
    </div>
  );
}
