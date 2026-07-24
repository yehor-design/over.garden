import "fake-indexeddb/auto";
import "@/lib/object-group-by-polyfill";

// Agent/dev shells often export VERCEL_ENV=production from .env.local.
// That alone forbids visual fixtures; keep fixture gates testable.
if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
  delete process.env.VERCEL_ENV;
}
