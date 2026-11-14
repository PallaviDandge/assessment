/** Small inline icons and card illustrations (original, no external assets). */
import type { SVGProps } from "react";

const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
);
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /></svg>
);
export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
);
export const ExpandIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);
export const ExternalIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={12} height={12} {...p} aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>
);
export const SpeakerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>
);
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" /></svg>
);

/** Assistant avatar: a stylised eye inside a rounded badge. */
export const AvatarMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="#fef3c7" />
    <path d="M5 14s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="#fff" stroke="#b45309" strokeWidth="1.6" />
    <circle cx="14" cy="14" r="3.2" fill="#7c3aed" />
    <circle cx="15" cy="13" r="1" fill="#fff" />
  </svg>
);

type Variant = "summary" | "talk" | "help" | "teach";
const palette: Record<Variant, [string, string]> = {
  summary: ["#ede9fe", "#7c3aed"],
  talk: ["#e0f2fe", "#0369a1"],
  help: ["#fef3c7", "#b45309"],
  teach: ["#dcfce7", "#15803d"],
};

/** Simple figure + prop illustration per card. */
export function CardArt({ variant }: { variant: Variant }) {
  const [bg, fg] = palette[variant];
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="34" fill={bg} />
      <circle cx="36" cy="27" r="9" fill={fg} opacity="0.9" />
      <path d="M20 56c2-10 8-15 16-15s14 5 16 15" fill={fg} opacity="0.75" />
      {variant === "summary" && <rect x="44" y="38" width="16" height="20" rx="2" fill="#fff" stroke={fg} strokeWidth="2" />}
      {variant === "summary" && <path d="M47 44h10M47 48h10M47 52h6" stroke={fg} strokeWidth="1.6" />}
      {variant === "talk" && <path d="M46 12h18v12h-8l-5 4v-4h-5z" fill="#fff" stroke={fg} strokeWidth="2" />}
      {variant === "help" && <text x="52" y="24" fontSize="18" fontWeight="700" fill={fg}>?</text>}
      {variant === "teach" && <rect x="46" y="12" width="18" height="13" rx="1.5" fill="#fff" stroke={fg} strokeWidth="2" />}
      {variant === "teach" && <path d="M49 16h10M49 20h7" stroke={fg} strokeWidth="1.6" />}
    </svg>
  );
}
