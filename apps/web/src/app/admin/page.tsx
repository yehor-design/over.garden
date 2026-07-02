import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ClipboardCheck,
  DatabaseZap,
  FileSearch,
  ShieldCheck,
  Sprout,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type { AdminCapability, AdminRole } from "@/lib/admin/roles";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { resolveAdminAccess } from "@/server/admin-access";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

const ADMIN_LINKS = [
  {
    href: "/admin/users",
    label: "Sealed owner",
    detail: "Single-owner status and audit trail",
    required: "Read-only: configured owner only",
    icon: UsersRound,
  },
  {
    href: "/garden/pilot-smoke",
    label: "Pilot smoke",
    detail: "Production readiness contract",
    required: "Owner only",
    icon: Activity,
  },
  {
    href: "/garden/pilot-health",
    label: "Pilot health",
    detail: "Aggregate activation signals",
    required: "Owner only",
    icon: ClipboardCheck,
  },
  {
    href: "/garden/pilot-learning/decision",
    label: "Cohort decision",
    detail: "Segment-level decision guard",
    required: "Owner only",
    icon: FileSearch,
  },
  {
    href: "/garden/pilot-learning/interviews",
    label: "Founder interviews",
    detail: "Bounded pilot learning rows",
    required: "Owner only",
    icon: ShieldCheck,
  },
  {
    href: "/garden/catalog/curation",
    label: "Catalog curation",
    detail: "Source and identity review",
    required: "Owner only",
    icon: DatabaseZap,
  },
  {
    href: "/garden/privacy/erasure-requests",
    label: "Erasure requests",
    detail: "Privacy request review",
    required: "Owner only",
    icon: Sprout,
  },
] as const;

type AdminSearchParams = Record<string, string | string[] | undefined>;

interface AdminPageProps {
  searchParams?: Promise<AdminSearchParams>;
}

export default async function AdminPage({ searchParams }: AdminPageProps = {}) {
  await (searchParams ?? Promise.resolve({}));
  const session = await getCurrentSession();
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;
  const access = await resolveAdminAccess(scope);

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <AdminHeader />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Control plane
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Sealed owner-only entry for internal operations. This dashboard
              renders links and status only, without private gardener data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              Role: {roleLabel(access.role)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Gate: {access.mode}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_LINKS.map((item) => (
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
        <h2 className="text-lg font-semibold text-foreground">Role boundary</h2>
        <div className="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
          <BoundaryItem label="Stored" value="Role grant metadata" />
          <BoundaryItem
            label="Excluded"
            value="Sensitive auth/request fields"
          />
          <BoundaryItem label="Private data" value="Not rendered here" />
          <BoundaryItem
            label="Capabilities"
            value={capabilityLabel(access.capabilities)}
          />
        </div>
      </section>
    </main>
  );
}

function AdminHeader() {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <Link
        href="/garden"
        className={buttonVariants({
          variant: "outline",
          className: "self-start",
        })}
      >
        Back to journal
      </Link>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Admin
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Internal control plane for the OverGarden pilot.
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

function roleLabel(role: AdminRole) {
  return role[0]?.toUpperCase() + role.slice(1);
}

function capabilityLabel(capabilities: AdminCapability[]) {
  const labels: Record<AdminCapability, string> = {
    "admin:read": "admin read",
    "admin:manage_roles": "sealed owner readback",
    "operator:read": "operator read",
    "operator:mutate": "operator mutation",
    "erasure:execute": "approved erasure execution",
  };

  return capabilities.map((capability) => labels[capability]).join(", ");
}
