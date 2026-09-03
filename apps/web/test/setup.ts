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

// Cache Components runtime helpers (ADR-0022, D4). `connection()` marks a
// render as request-time and needs a request scope; `cacheTag`/`cacheLife`
// need the Cache Components runtime. Neither exists in a unit test.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// App Router client hooks. A workspace failure panel renders a client retry
// control that calls `router.refresh()` (ADR-0023); in a real render Next
// provides the router context on the server pass too, but a unit test renders
// the tree bare. Everything else in the module — `notFound`, `redirect`,
// `unstable_rethrow` — stays the real implementation, and a suite that needs
// its own router mock still overrides this one.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Request-scoped cookies. `resolveWorkspaceViewer` reads the session cookie to
// tell a signed-out visitor from a session store it could not reach (ADR-0023),
// and the real `cookies()` needs a request scope no unit test has. The default
// is an empty store — nobody is signed in — and a suite that needs cookie values
// mocks the module itself, which overrides this.
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
  }),
}));
