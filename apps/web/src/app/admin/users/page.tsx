import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  ADMIN_ROLE_CHANGE_REASONS,
  MANAGEABLE_ADMIN_ROLES,
  type AdminRole,
  type AdminRoleChangeReason,
} from "@/lib/admin/roles";
import { resolveAdminCapabilityAccess } from "@/server/admin-access";
import {
  readAdminRoleManagementView,
  type AdminRoleAssignmentReadModel,
  type AdminRoleAuditReadModel,
} from "@/server/admin-role-management-repository";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";
import { grantAdminRoleAction, revokeAdminRoleAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin users | OverGarden",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminUsersPage() {
  const session = await getCurrentSession();
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;

  if (!scope) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminUsersHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  const access = await resolveAdminCapabilityAccess(
    scope,
    "admin:manage_roles",
  );

  if (access.status === "sign_in_required") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminUsersHeader />
        <GardenAuthPanel />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminUsersHeader />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  const view = await readAdminRoleManagementView(scope);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <AdminUsersHeader />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Role management
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Owner-only grants for internal roles. Use exact Better Auth user
              ids from a secure operator channel; emails and provider claims are
              intentionally not used for authorization.
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

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Grant a role
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Grant only `admin`, `moderator`, or `viewer`. Owner access remains a
            bootstrap-controlled role.
          </p>
        </div>

        <form
          action={grantAdminRoleAction}
          className="grid gap-3 border-t border-border pt-4 md:grid-cols-2 lg:grid-cols-4"
        >
          <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
            Better Auth user id
            <input
              name="targetUserId"
              required
              placeholder="00000000-0000-4000-8000-000000000001"
              className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <SelectField
            label="Role"
            name="role"
            options={MANAGEABLE_ADMIN_ROLES.map((role) => ({
              value: role,
              label: roleLabel(role),
            }))}
          />
          <SelectField
            label="Reason"
            name="reason"
            options={ADMIN_ROLE_CHANGE_REASONS.filter(
              (reason) => reason !== "access_revoked",
            ).map((reason) => ({
              value: reason,
              label: reasonLabel(reason),
            }))}
          />
          <button
            type="submit"
            className={buttonVariants({ className: "self-end" })}
          >
            Grant role
          </button>
        </form>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Current role assignments
          </h2>
          <span className="text-xs text-muted-foreground">
            {view.assignments.length} assignment
            {view.assignments.length === 1 ? "" : "s"}
          </span>
        </div>

        {view.assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No admin roles have been assigned.
          </p>
        ) : (
          <ol className="grid gap-3">
            {view.assignments.map((assignment) => (
              <RoleAssignmentCard
                key={assignment.userId}
                assignment={assignment}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Recent role audit
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Audit entries store internal ids, bounded role/action/reason enums,
            and a one-way session hash. This view does not render emails,
            cookies, raw session ids, IP/user-agent fields, provider tokens,
            journal content, media keys, coordinates, or env values.
          </p>
        </div>
        {view.auditEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No role changes have been recorded yet.
          </p>
        ) : (
          <ol className="grid gap-3">
            {view.auditEntries.map((entry) => (
              <AuditEntryCard key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function RoleAssignmentCard({
  assignment,
}: {
  assignment: AdminRoleAssignmentReadModel;
}) {
  const isOwner = assignment.role === "owner";

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h3 className="font-semibold text-foreground">
            {roleLabel(assignment.role)}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">
            {userReference(assignment.userId)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Reason: {reasonLabel(assignment.grantReason)}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            Updated: {formatDate(assignment.updatedAt)}
          </span>
        </div>
      </div>
      {assignment.grantedByUserId ? (
        <p className="font-mono text-xs text-muted-foreground">
          Granted by {userReference(assignment.grantedByUserId)}
        </p>
      ) : null}

      {isOwner ? (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          Owner role is protected. Last-owner removal is blocked server-side.
        </p>
      ) : (
        <form action={revokeAdminRoleAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="targetUserId" value={assignment.userId} />
          <input type="hidden" name="reason" value="access_revoked" />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Revoke role
          </button>
        </form>
      )}
    </li>
  );
}

function AuditEntryCard({ entry }: { entry: AdminRoleAuditReadModel }) {
  return (
    <li className="grid gap-2 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="font-semibold text-foreground">
          {entry.action === "grant" ? "Granted" : "Revoked"}{" "}
          {roleTransitionLabel(entry)}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatDate(entry.createdAt)}
        </time>
      </div>
      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-3">
        <Field
          label="Actor"
          value={
            entry.actorUserId
              ? userReference(entry.actorUserId)
              : "user removed"
          }
        />
        <Field
          label="Target"
          value={
            entry.targetUserId
              ? userReference(entry.targetUserId)
              : "user removed"
          }
        />
        <Field label="Reason" value={reasonLabel(entry.reason)} />
      </dl>
    </li>
  );
}

function AdminUsersHeader() {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          Admin
        </Link>
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          Garden journal
        </Link>
      </div>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Admin users
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Owner-controlled role grants and audit trail for the internal control
          plane.
        </p>
      </div>
    </header>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground uppercase">
      {label}
      <select
        name={name}
        required
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

function roleLabel(role: AdminRole) {
  return role[0]?.toUpperCase() + role.slice(1);
}

function reasonLabel(reason: AdminRoleChangeReason | "manual_bootstrap") {
  const labels: Record<AdminRoleChangeReason | "manual_bootstrap", string> = {
    manual_bootstrap: "Manual bootstrap",
    manual_owner_grant: "Manual owner grant",
    pilot_operator_delegation: "Pilot operator delegation",
    temporary_coverage: "Temporary coverage",
    role_cleanup: "Role cleanup",
    access_revoked: "Access revoked",
  };

  return labels[reason];
}

function userReference(userId: string) {
  return `user ${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

function roleTransitionLabel(entry: AdminRoleAuditReadModel) {
  if (entry.action === "revoke") {
    return entry.previousRole ? roleLabel(entry.previousRole) : "role";
  }

  if (entry.previousRole && entry.newRole) {
    return `${roleLabel(entry.previousRole)} -> ${roleLabel(entry.newRole)}`;
  }

  return entry.newRole ? roleLabel(entry.newRole) : "role";
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
