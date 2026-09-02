import { vi } from "vitest";
import "@/lib/object-group-by-polyfill";

// Agent/dev shells often export VERCEL_ENV=production from .env.local.
// That alone forbids visual fixtures; keep fixture gates testable.
if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
  delete process.env.VERCEL_ENV;
}

// `next/font` relies on the Next.js SWC transform, which vitest does not run.
// Return the same shape the loader returns so layouts can apply the classes.
vi.mock("next/font/google", () => {
  const font = (variable: string) => () => ({
    className: variable.slice(2),
    variable,
    style: { fontFamily: variable },
  });
  return {
    Google_Sans: font("--font-google-sans"),
    Geist_Mono: font("--font-geist-mono"),
  };
});
