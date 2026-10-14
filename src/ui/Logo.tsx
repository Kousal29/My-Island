/** The My Island mark: a black island with the cat peeking out of it. */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-label="My Island">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1830" />
          <stop offset="1" stopColor="#08080c" />
        </linearGradient>
        <radialGradient id="lg-glow" cx="0.5" cy="0.36" r="0.55">
          <stop offset="0" stopColor="#8b7bff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-eye" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9a8ff" />
          <stop offset="1" stopColor="#5fe3d0" />
        </linearGradient>
      </defs>
      <rect x="48" y="48" width="928" height="928" rx="232" fill="url(#lg-bg)" />
      <rect x="48" y="48" width="928" height="928" rx="232" fill="url(#lg-glow)" />
      <path d="M352 432 L382 300 Q388 280 404 294 L478 392 Z" fill="#0b0b10" />
      <path d="M672 432 L642 300 Q636 280 620 294 L546 392 Z" fill="#0b0b10" />
      <path d="M384 404 L398 330 L446 392 Z" fill="#ff8fb0" opacity="0.85" />
      <path d="M640 404 L626 330 L578 392 Z" fill="#ff8fb0" opacity="0.85" />
      <rect x="232" y="392" width="560" height="196" rx="98" fill="#0a0a0e" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="4" />
      <ellipse cx="430" cy="490" rx="44" ry="50" fill="url(#lg-eye)" />
      <ellipse cx="594" cy="490" rx="44" ry="50" fill="url(#lg-eye)" />
      <ellipse cx="438" cy="496" rx="15" ry="32" fill="#08080c" />
      <ellipse cx="602" cy="496" rx="15" ry="32" fill="#08080c" />
      <circle cx="447" cy="470" r="9" fill="#fff" />
      <circle cx="611" cy="470" r="9" fill="#fff" />
      <path d="M494 548 Q512 562 530 548" stroke="#ff8fb0" strokeWidth="9" fill="none" strokeLinecap="round" />
    </svg>
  );
}
