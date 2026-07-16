import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { OperatorSmokeCopy } from "@/lib/operator-smoke-copy";
import {
  getOperatorSmokeCopy,
  operatorSmokeCheckLabel,
} from "@/lib/operator-smoke-copy";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import type {
  PilotSmokeCheck,
  PilotSmokeSeverity,
} from "@/server/pilot-smoke-readiness";
import { getPilotSmokeReadinessSafely } from "@/server/pilot-smoke-readiness";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolvePilotHealthOperatorAccess } from "@/server/pilot-health-access";
import { scopedToUser } from "@/server/request-scope";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { GardenAuthPanel } from "../garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorSmokeCopy(await getRequestInterfaceLocale());
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function PilotSmokePage() {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const operatorCopy = getOperatorCopy(locale);
  const copy = getOperatorSmokeCopy(locale);
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;
  const access = await resolvePilotHealthOperatorAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotSmokeHeader operatorCopy={operatorCopy} copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <PilotSmokeHeader operatorCopy={operatorCopy} copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {operatorCopy.common.accessDenied}
        </p>
      </main>
    );
  }

  const readout = await getPilotSmokeReadinessSafely();
  const totals = countStatuses(
    readout.sections.flatMap((section) => section.checks),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <PilotSmokeHeader operatorCopy={operatorCopy} copy={copy} />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.readinessStatus}: {copy.overall[readout.overall]}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {formatOperatorTemplate(copy.generatedDescription, {
                date: formatOperatorDate(locale, readout.generatedAt),
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {operatorCopy.common.gate}:{" "}
              {operatorAccessModeLabel(locale, access.mode)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {operatorCopy.common.role}:{" "}
              {operatorRoleLabel(locale, access.role)}
            </span>
            <StatusPill severity="pass" count={totals.pass} copy={copy} />
            <StatusPill severity="warn" count={totals.warn} copy={copy} />
            <StatusPill severity="fail" count={totals.fail} copy={copy} />
            <StatusPill severity="manual" count={totals.manual} copy={copy} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {readout.sections.map((section) => (
          <div
            key={section.id}
            className="grid content-start gap-3 rounded-lg border border-border p-4"
          >
            <h2 className="text-lg font-semibold text-foreground">
              {copy.sections[section.id as keyof typeof copy.sections] ??
                section.id}
            </h2>
            <ul className="grid gap-3">
              {section.checks.map((check) => (
                <li
                  key={check.id}
                  className="grid gap-2 rounded-lg border border-border p-3"
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon severity={check.severity} />
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {operatorSmokeCheckLabel(locale, check.id)}
                        </h3>
                        <span className={statusClassName(check.severity)}>
                          {copy.severities[check.severity]}
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {copy.severitySummaries[check.severity]}
                      </p>
                    </div>
                  </div>
                  <p className="border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {copy.literalEvidence}:{" "}
                    </span>
                    {check.evidence}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.smokeSequence}
        </h2>
        <ol className="grid gap-2 text-sm leading-6 text-muted-foreground">
          {copy.smokeSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.redactionRulesTitle}
        </h2>
        <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
          {copy.redactionRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.referencesTitle}
        </h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {readout.references.map((reference) => (
            <span
              key={reference.path}
              className="rounded-md border border-border px-2 py-1"
            >
              {copy.references[
                reference.path as keyof typeof copy.references
              ] ?? reference.path}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function PilotSmokeHeader({
  operatorCopy,
  copy,
}: {
  operatorCopy: OperatorCopy;
  copy: OperatorSmokeCopy;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          {operatorCopy.common.backToJournal}
        </Link>
        <Link
          href="/garden/pilot-health"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          {operatorCopy.common.pilotHealth}
        </Link>
      </div>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>
    </header>
  );
}

function StatusPill({
  severity,
  count,
  copy,
}: {
  severity: PilotSmokeSeverity;
  count: number;
  copy: OperatorSmokeCopy;
}) {
  return (
    <span className={statusClassName(severity)}>
      {copy.severities[severity]}: {count}
    </span>
  );
}

function StatusIcon({ severity }: { severity: PilotSmokeSeverity }) {
  const className = "mt-0.5 size-4 shrink-0";

  if (severity === "pass") {
    return <CheckCircle2 className={`${className} text-emerald-700`} />;
  }
  if (severity === "warn") {
    return <AlertTriangle className={`${className} text-amber-700`} />;
  }
  if (severity === "fail") {
    return <ShieldAlert className={`${className} text-red-700`} />;
  }
  return <CircleHelp className={`${className} text-sky-700`} />;
}

function countStatuses(checks: PilotSmokeCheck[]) {
  return checks.reduce(
    (accumulator, check) => {
      accumulator[check.severity] += 1;
      return accumulator;
    },
    { pass: 0, warn: 0, fail: 0, manual: 0 },
  );
}

function statusClassName(severity: PilotSmokeSeverity) {
  const base =
    "rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-normal";

  if (severity === "pass") {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
  }
  if (severity === "warn") {
    return `${base} border-amber-200 bg-amber-50 text-amber-800`;
  }
  if (severity === "fail") {
    return `${base} border-red-200 bg-red-50 text-red-800`;
  }
  return `${base} border-sky-200 bg-sky-50 text-sky-800`;
}
