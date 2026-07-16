import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import {
  hasUsableBetterAuthSecret,
  isProductionLikeRuntime,
} from "@/lib/auth-secret";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { formatOperatorTemplate, getOperatorCopy } from "@/lib/operator-copy";
import { pingDatabase, readRecentHealth } from "@/server/health-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCopy(await getRequestInterfaceLocale()).health;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

async function getAuthStatus(locale: InterfaceLocale): Promise<string> {
  const copy = getOperatorCopy(locale).health;
  if (hasUsableBetterAuthSecret()) {
    return copy.authConfigured;
  }

  if (isProductionLikeRuntime()) {
    return copy.authClosed;
  }

  return copy.authLocalFallback;
}

async function getDbStatus(locale: InterfaceLocale): Promise<string> {
  const copy = getOperatorCopy(locale).health;
  try {
    const [isReachable, rows] = await Promise.all([
      pingDatabase(),
      readRecentHealth(3),
    ]);
    return formatOperatorTemplate(copy.dbOk, {
      ping: String(isReachable),
      count: rows.length,
    });
  } catch {
    return copy.dbUnavailable;
  }
}

export default async function HealthPage() {
  const locale = await getRequestInterfaceLocale();
  const copy = getOperatorCopy(locale).health;
  const renderedAt = new Date().toISOString();
  const cyrillic =
    "UTF-8 check — Помідори чері (uk) · Чушки печени (bg) · Огурцы (ru)";
  const [authStatus, dbStatus] = await Promise.all([
    getAuthStatus(locale),
    getDbStatus(locale),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="text-muted-foreground">{copy.description}</p>
      </header>

      <dl className="grid grid-cols-1 gap-3">
        <Row label={copy.renderedAt} value={renderedAt} />
        <Row label={copy.utf8} value={cyrillic} />
        <Row label={copy.auth} value={authStatus} />
        <Row label={copy.database} value={dbStatus} />
      </dl>

      <div className="flex items-center gap-3">
        <Button>{copy.primaryButton}</Button>
        <Button variant="outline">{copy.outlineButton}</Button>
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
