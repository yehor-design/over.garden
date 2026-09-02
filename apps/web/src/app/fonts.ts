import { Geist_Mono, Google_Sans } from "next/font/google";

/**
 * The only typography wiring in the app (ADR-0022, D7). Next downloads the
 * subsets at build time, self-hosts them under `/_next/static`, preloads the
 * critical files, and generates a metric-matched fallback so text does not
 * shift while the real face loads. `globals.css` consumes the two variables.
 */
export const googleSans = Google_Sans({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
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
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  variable: "--font-geist-mono",
});
