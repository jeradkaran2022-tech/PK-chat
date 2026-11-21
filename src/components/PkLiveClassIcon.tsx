import React from 'react';

export function PkLiveClassIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Classroom Display Frame */}
      <rect x="2.5" y="4" width="19" height="13" rx="3" />
      {/* Live Broadcast Signal Wave inside Classroom */}
      <path d="M8.5 12.2a3.5 3.5 0 0 1 7 0" />
      <circle cx="12" cy="9.2" r="1.35" fill="currentColor" stroke="none" />
      {/* Presenter Lectern & Live Beacon Dot */}
      <path d="M7.5 20h9" />
      <path d="M12 17v3" />
      <circle cx="17.8" cy="7.2" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
