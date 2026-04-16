export function LlamaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Left ear */}
      <path d="M8 1 L6.5 4.5 L9.5 4.5 Z" />
      {/* Right ear */}
      <path d="M14 1 L12.5 4.5 L15.5 4.5 Z" />
      {/* Head — dome shape spanning both ears */}
      <path d="M6 4.5 Q6 9.5 11 9.5 Q16 9.5 16 4.5 Z" />
      {/* Neck — slight taper, widens toward body */}
      <path d="M9 9.5 L7 15 L16 15 L16 9.5 Z" />
      {/* Body */}
      <rect x="4" y="14.5" width="17" height="5.5" rx="2.5" />
      {/* Legs */}
      <rect x="6"    y="19.5" width="2.5" height="3.5" rx="1" />
      <rect x="9.5"  y="19.5" width="2.5" height="3.5" rx="1" />
      <rect x="13"   y="19.5" width="2.5" height="3.5" rx="1" />
      <rect x="16.5" y="19.5" width="2.5" height="3.5" rx="1" />
    </svg>
  );
}
