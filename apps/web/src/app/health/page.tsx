import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { readRecentHealth } from "@/server/health-repository";

// Always render on the server, per request — this is the SSR seam proof and
// avoids static execution at build time (when Supabase/DB are not wired).
export const dynamic = "force-dynamic";

async function getAuthStatus(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error) return `auth error: ${error.message}`;
    if (!data?.claims) return "RSC session read OK — no active session (anon)";
    return `RSC session read OK — sub=${data.claims.sub}`;
  } catch (e) {
    return `Supabase not wired yet (deferred): ${(e as Error).message}`;
  }
}

async function getDbStatus(): Promise<string> {
  try {
    const rows = await readRecentHealth(3);
    return `Drizzle read OK — ${rows.length} health row(s)`;
  } catch (e) {
    return `Database not wired yet (deferred): ${(e as Error).message}`;
  }
}

export default async function HealthPage() {
  const renderedAt = new Date().toISOString();
  const cyrillic =
    "UTF-8 check — Помідори чері (uk) · Чушки печени (bg) · Огурцы (ru)";
  const [authStatus, dbStatus] = await Promise.all([
    getAuthStatus(),
    getDbStatus(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Infrastructure health
        </h1>
        <p className="text-muted-foreground">
          Server-rendered tracer that proves the runtime seams are live. This is
          not product UI — it is deleted when the design system arrives.
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3">
        <Row label="Rendered on server at" value={renderedAt} />
        <Row label="UTF-8 / Cyrillic" value={cyrillic} />
        <Row label="Auth (RSC getClaims)" value={authStatus} />
        <Row label="Database (Drizzle / Supavisor)" value={dbStatus} />
      </dl>

      <div className="flex items-center gap-3">
        <Button>shadcn Button (SSR)</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm break-words text-foreground">{value}</dd>
    </div>
  );
}
