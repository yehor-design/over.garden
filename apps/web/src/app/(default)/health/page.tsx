import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { getAuthSecretHealth } from "@/lib/auth-secret";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatOperatorTemplate,
  getOperatorCopy,
  getOperatorDatabaseAvailabilityCopy,
} from "@/lib/operator-copy";
import type { Ove330ServeClass } from "@/lib/media/presentation-contract";
import { pingDatabase, readRecentHealth } from "@/server/health-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";

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
  const health = getAuthSecretHealth();
  if (health.class === "versioned_current") {
    return formatOperatorTemplate(copy.authVersionedCurrent, {
      version: String(health.activeVersion),
    });
  }

  if (health.class === "legacy_transition") {
    return copy.authLegacyTransition;
  }

  if (health.class === "weak_secret") {
    return copy.authWeakSecret;
  }

  return health.class === "local_fallback"
    ? copy.authLocalFallback
    : copy.authClosed;
}

async function getDbStatus(locale: InterfaceLocale): Promise<{
  message: string;
  serveClass: "exact" | "seam_unmet";
}> {
  const copy = getOperatorCopy(locale).health;
  try {
    const [isReachable, rows] = await Promise.all([
      pingDatabase(),
      readRecentHealth(3),
    ]);
    return {
      message: formatOperatorTemplate(copy.dbOk, {
        ping: String(isReachable),
        count: rows.length,
      }),
      serveClass: "exact",
    };
  } catch {
    return getOperatorDatabaseAvailabilityCopy(locale);
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
        <Row
          label={copy.database}
          value={dbStatus.message}
          serveClass={dbStatus.serveClass}
        />
      </dl>

      <div className="flex items-center gap-3">
        <Button>{copy.primaryButton}</Button>
        <Button variant="outline">{copy.outlineButton}</Button>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  serveClass,
}: {
  label: string;
  value: string;
  serveClass?: Ove330ServeClass;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-border p-3"
      data-operator-db-serve-class={serveClass}
      role={serveClass ? "status" : undefined}
    >
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm break-words text-foreground">{value}</dd>
    </div>
  );
}
