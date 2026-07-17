import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ClipboardCheck,
  DatabaseZap,
  FileSearch,
  ShieldCheck,
  ShieldAlert,
  Sprout,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorCapabilityLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminAccess } from "@/server/admin-access";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCopy(await getRequestInterfaceLocale()).admin;
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

type AdminSearchParams = Record<string, string | string[] | undefined>;

interface AdminPageProps {
  searchParams?: Promise<AdminSearchParams>;
}

export default async function AdminPage({ searchParams }: AdminPageProps = {}) {
  const [, locale, session] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getOperatorCopy(locale);
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;
  const access = await resolveAdminAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main
        data-operator-surface="admin"
        data-operator-access-state="sign-in-required"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <AdminHeader copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main
        data-operator-surface="admin"
        data-operator-access-state="denied"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8"
      >
        <AdminHeader copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {copy.common.accessDenied}
        </p>
      </main>
    );
  }

  return (
    <main
      data-operator-surface="admin"
      data-operator-access-state="allowed"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8"
    >
      <AdminHeader copy={copy} />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.admin.controlPlane}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {copy.admin.controlPlaneDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {copy.common.role}: {operatorRoleLabel(locale, access.role)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.common.gate}: {operatorAccessModeLabel(locale, access.mode)}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminLinks(copy).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="grid min-h-32 content-start gap-3 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <item.icon className="size-5 text-primary" aria-hidden="true" />
            <span className="grid gap-1">
              <span className="text-sm font-semibold text-foreground">
                {item.label}
              </span>
              <span className="text-sm leading-6 text-muted-foreground">
                {item.detail}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {item.required}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-foreground">
          {copy.admin.boundaryTitle}
        </h2>
        <div className="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
          <BoundaryItem
            label={copy.admin.boundary.storedLabel}
            value={copy.admin.boundary.storedValue}
          />
          <BoundaryItem
            label={copy.admin.boundary.excludedLabel}
            value={copy.admin.boundary.excludedValue}
          />
          <BoundaryItem
            label={copy.admin.boundary.privateLabel}
            value={copy.admin.boundary.privateValue}
          />
          <BoundaryItem
            label={copy.admin.boundary.capabilitiesLabel}
            value={operatorCapabilityLabel(locale, access.capabilities)}
          />
        </div>
      </section>
    </main>
  );
}

function AdminHeader({ copy }: { copy: OperatorCopy }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        {copy.common.backToJournal}
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.admin.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.admin.description}
        </p>
      </div>
    </header>
  );
}

function BoundaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border p-3">
      <span className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function adminLinks(copy: OperatorCopy) {
  return [
    {
      href: "/admin/communities",
      ...copy.admin.links.communities,
      icon: ShieldAlert,
    },
    { href: "/admin/users", ...copy.admin.links.users, icon: UsersRound },
    { href: "/garden/pilot-smoke", ...copy.admin.links.smoke, icon: Activity },
    {
      href: "/garden/pilot-health",
      ...copy.admin.links.health,
      icon: ClipboardCheck,
    },
    {
      href: "/garden/pilot-learning/decision",
      ...copy.admin.links.decision,
      icon: FileSearch,
    },
    {
      href: "/garden/pilot-learning/interviews",
      ...copy.admin.links.interviews,
      icon: ShieldCheck,
    },
    {
      href: "/garden/catalog/curation",
      ...copy.admin.links.curation,
      icon: DatabaseZap,
    },
    {
      href: "/garden/privacy/erasure-requests",
      ...copy.admin.links.erasure,
      icon: Sprout,
    },
  ] as const;
}
