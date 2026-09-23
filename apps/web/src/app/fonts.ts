import { Geist_Mono, Google_Sans } from "next/font/google";

/**
 * The only typography wiring in the app (ADR-0022, D7). Next downloads the
 * subsets at build time, self-hosts them under `/_next/static`, preloads the
 * critical files, and generates a metric-matched fallback so text does not
 * shift while the real face loads. `globals.css` consumes the variables.
 *
 * Preload budget (`OVE-469`): what the first screen draws is preloaded, and
 * nothing else. On a slow link every preloaded file shares the bandwidth with
 * the page's photograph, which is its LCP.
 *
 * - Normal Latin and Cyrillic are every page's text.
 * - Italic Latin is the accepted name beneath an organism card's heading and
 *   a species label in an entry, both on the first screen.
 * - Italic Cyrillic appears only in a story's quotations and a panel's notes,
 *   below the first screen, so it loads when a page uses it. That is one file
 *   (17 kB) fewer beside the photograph.
 *
 * `subsets` decides only what is preloaded: each call declares every range of
 * its style, so the italic call below still declares Cyrillic italic. A third
 * call for it would declare the Latin italic range a second time, under a file
 * name without the preload's, and the later rule wins — the preloaded file
 * would go unused and the face would download twice. Both calls are one
 * family: `next/font/google` names each face "Google Sans", so an italic still
 * finds its face. The three interface languages and
 * Latin scientific names live in `latin` and `cyrillic` (Ukrainian ґ, є, і, ї
 * included); rarer glyphs fall back to the declared stack. The monospace face
 * is not above the fold on any public page, so it loads on use.
 */
export const googleSans = Google_Sans({
  subsets: ["latin", "cyrillic"],
  style: ["normal"],
  display: "swap",
  variable: "--font-google-sans",
  // Next.js has no metric table for Google Sans, so it cannot synthesize a
  // size-adjusted fallback. Declaring the fallback stack by hand keeps the
  // build warning-free; globals.css repeats the same stack for the variable.
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: false,
});

const googleSansItalic = Google_Sans({
  subsets: ["latin"],
  style: ["italic"],
  display: "swap",
  variable: "--font-google-sans-italic",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: false,
});

/**
 * The classes that put every Google Sans face in the page: the variable the
 * stylesheet reads, and the italic declaration's, which nothing reads — it is
 * there so the italic `@font-face` rules ship with the page. A `className`
 * would set `font-style` on the element it is on; a variable sets nothing.
 */
export const googleSansFaces = `${googleSans.variable} ${googleSansItalic.variable}`;

export const geistMono = Geist_Mono({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  preload: false,
  variable: "--font-geist-mono",
});
