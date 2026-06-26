import { Button } from "@/components/ui/button";
import { optionalServerEnv } from "@/lib/env";
import { pingDatabase, readRecentHealth } from "@/server/health-repository";

export const dynamic = "force-dynamic";

async function getAuthStatus(): Promise<string> {
  if (!optionalServerEnv("BETTER_AUTH_SECRET")) {
    return "Better Auth route mounted — local development secret fallback is active";
  }
  return "Better Auth route mounted — secret configured";
}

async function getDbStatus(): Promise<string> {
  try {
    const [isReachable, rows] = await Promise.all([
      pingDatabase(),
      readRecentHealth(3),
    ]);
    return `Kysely read OK — ping=${String(isReachable)} · ${rows.length} health row(s)`;
  } catch (e) {
    return `Postgres not wired yet (deferred): ${(e as Error).message}`;
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
          Server-rendered tracer for the current stack. This is not product UI.
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3">
        <Row label="Rendered on server at" value={renderedAt} />
        <Row label="UTF-8 / Cyrillic" value={cyrillic} />
        <Row label="Auth (Better Auth)" value={authStatus} />
        <Row label="Database (Kysely / Postgres)" value={dbStatus} />
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
