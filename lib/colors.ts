// ─── Palette Tokens ─────────────────────────────────────────────
// Every color Hirely uses lives here, named by what it represents,
// not by what it looks like. If the brand color ever changes, this
// is the ONLY file that needs editing — every component just
// references PALETTE.brandRed, never the hex code directly.
export const PALETTE = {
  brandRed: '#C4252A',   // primary action color (buttons, active tabs)
  darkRed: '#CC0000',    // hover/pressed state for red elements
  charcoal: '#424242',   // primary text color
  slate: '#475052',      // secondary/muted text
  lightGray: '#DCDDDD',  // borders, dividers
  background: '#FFFFFF', // page background (light mode)
  darkBackground: '#1C2325', // page background (dark mode)
} as const;

// ─── Pre-composed UI Class Strings ─────────────────────────────
// Instead of writing Tailwind classes by hand in every component,
// reference these named patterns. Keeps every button/badge
// consistent across the whole app without copy-pasting classes.
export const UI = {
  primaryBtn: 'bg-[#C4252A] hover:bg-[#CC0000] text-white',
  outlineBtn: 'border border-[#C4252A] text-[#C4252A] hover:bg-[#C4252A] hover:text-white',
  tabActive: 'border-[#C4252A] text-[#C4252A]',
} as const;