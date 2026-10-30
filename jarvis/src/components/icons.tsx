// Íconos de línea (estilo SF Symbols simplificado).
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconHome = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IconChat = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 3.5V6M12 18v2.5M3.5 12H6M18 12h2.5" /></svg>
);
export const IconBulb = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>
);
export const IconFlame = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M12 21c-3.9 0-7-2.9-7-6.6 0-3.1 2.2-5.2 3.7-7.1.5 1.6 1.4 2.7 2.6 3.2C11.6 7.6 12.8 5 15 3c.3 3 4 5.3 4 10.4 0 4.3-3.1 7.6-7 7.6z" /></svg>
);
export const IconGear = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconMic = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconPlus = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconClock = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconBell = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" /></svg>
);
export const IconRepeat = ({ className = "size-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4" /></svg>
);
export const IconSend = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconTrash = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const IconBack = ({ className = "size-6" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconList = ({ className = "size-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>
);
