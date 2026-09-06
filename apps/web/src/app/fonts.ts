import { Geist_Mono, Google_Sans } from "next/font/google";

/**
 * The only typography wiring in the app (ADR-0022, D7). Next downloads the
 * subsets at build time, self-hosts them under `/_next/static`, preloads the
 * critical files, and generates a metric-matched fallback so text does not
 * shift while the real face loads. `globals.css` consumes the two variables.
 *
 * Preload budget (ADR-0026 D9, the organism card's Lighthouse gate): every
 * declared subset of every declared style is preloaded on every page, and a
 * text LCP waits for them under Lighthouse's simulated throttling. The three
 * interface languages and Latin scientific names live in `latin` and
 * `cyrillic` (Ukrainian ґ, є, і, ї included); rarer glyphs fall back to the
 * declared stack. The monospace face is not above the fold on any public
 * page, so it loads on use.
 */
export const googleSans = Google_Sans({
  subsets: ["latin", "cyrillic"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-google-sans",
  // Next.js has no metric table for Google Sans, so it cannot synthesize a
  // size-adjusted fallback. Declaring the fallback stack by hand keeps the
  // build warning-free; globals.css repeats the same stack for the variable.
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: false,
});

export const geistMono = Geist_Mono({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  variable: "--font-geist-mono",
});
