import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { AdminRoleChangeReason } from "@/lib/admin/roles";
import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OperatorCopy } from "@/lib/operator-copy";
import {
  formatOperatorCount,
  formatOperatorDate,
  formatOperatorTemplate,
  getOperatorCopy,
  operatorAccessModeLabel,
  operatorRoleLabel,
} from "@/lib/operator-copy";
import { resolveAdminCapabilityAccess } from "@/server/admin-access";
import {
  readAdminRoleManagementView,
  type AdminRoleAssignmentReadModel,
  type AdminRoleAuditReadModel,
} from "@/server/admin-role-management-repository";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { GardenAuthPanel } from "../../garden/garden-auth-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCopy(await getRequestInterfaceLocale()).adminUsers;
  return {
    title: copy.metadataTitle,
    robots: { index: false, follow: false },
  };
}

type AdminUsersSearchParams = Record<string, string | string[] | undefined>;

interface AdminUsersPageProps {
  searchParams?: Promise<AdminUsersSearchParams>;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps = {}) {
  const [, locale, session] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getOperatorCopy(locale);
  const scope = session?.user?.id
    ? scopedToUser(session.user.id, getSessionId(session))
    : null;

  if (!scope) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminUsersHeader copy={copy} />
        <GardenAuthPanel locale={locale} />
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
        <AdminUsersHeader copy={copy} />
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  if (access.status === "denied") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <AdminUsersHeader copy={copy} />
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {copy.common.accessDenied}
        </p>
      </main>
    );
  }

  const view = await readAdminRoleManagementView(scope);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <AdminUsersHeader copy={copy} />

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              {copy.adminUsers.accessTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {copy.adminUsers.accessDescription}
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

      <section className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.adminUsers.assignmentsTitle}
          </h2>
          <span className="text-xs text-muted-foreground">
            {formatOperatorCount(
              locale,
              view.assignments.length,
              copy.adminUsers.assignmentCount,
            )}
          </span>
        </div>

        {view.assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.adminUsers.noAssignment}
          </p>
        ) : (
          <ol className="grid gap-3">
            {view.assignments.map((assignment) => (
              <RoleAssignmentCard
                key={assignment.userId}
                assignment={assignment}
                locale={locale}
                copy={copy}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.adminUsers.auditTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.adminUsers.auditDescription}
          </p>
        </div>
        {view.auditEntries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {copy.adminUsers.noAudit}
          </p>
        ) : (
          <ol className="grid gap-3">
            {view.auditEntries.map((entry) => (
              <AuditEntryCard
                key={entry.id}
                entry={entry}
                locale={locale}
                copy={copy}
              />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function RoleAssignmentCard({
  assignment,
  locale,
  copy,
}: {
  assignment: AdminRoleAssignmentReadModel;
  locale: InterfaceLocale;
  copy: OperatorCopy;
}) {
  const isOwner = assignment.role === "owner";

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h3 className="font-semibold text-foreground">
            {operatorRoleLabel(locale, assignment.role)}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">
            {userReference(copy, assignment.userId)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            {copy.adminUsers.reason}:{" "}
            {reasonLabel(copy, assignment.grantReason)}
          </span>
          <span className="rounded-md border border-border px-2 py-1">
            {copy.adminUsers.updated}:{" "}
            {formatOperatorDate(locale, assignment.updatedAt)}
          </span>
        </div>
      </div>
      {assignment.grantedByUserId ? (
        <p className="font-mono text-xs text-muted-foreground">
          {copy.adminUsers.grantedBy}{" "}
          {userReference(copy, assignment.grantedByUserId)}
        </p>
      ) : null}

      {isOwner ? (
        <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          {copy.adminUsers.ownerSealed}
        </p>
      ) : (
        <p className="rounded-md border border-destructive/30 p-3 text-xs text-muted-foreground">
          {copy.adminUsers.invalidAssignment}
        </p>
      )}
    </li>
  );
}

function AuditEntryCard({
  entry,
  locale,
  copy,
}: {
  entry: AdminRoleAuditReadModel;
  locale: InterfaceLocale;
  copy: OperatorCopy;
}) {
  return (
    <li className="grid gap-2 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="font-semibold text-foreground">
          {entry.action === "grant"
            ? copy.adminUsers.granted
            : copy.adminUsers.revoked}{" "}
          {roleTransitionLabel(locale, copy, entry)}
        </h3>
        <time className="text-xs text-muted-foreground">
          {formatOperatorDate(locale, entry.createdAt)}
        </time>
      </div>
      <dl className="grid gap-2 text-muted-foreground sm:grid-cols-3">
        <Field
          label={copy.adminUsers.actor}
          value={
            entry.actorUserId
              ? userReference(copy, entry.actorUserId)
              : copy.adminUsers.userRemoved
          }
        />
        <Field
          label={copy.adminUsers.target}
          value={
            entry.targetUserId
              ? userReference(copy, entry.targetUserId)
              : copy.adminUsers.userRemoved
          }
        />
        <Field
          label={copy.adminUsers.reason}
          value={reasonLabel(copy, entry.reason)}
        />
      </dl>
    </li>
  );
}

function AdminUsersHeader({ copy }: { copy: OperatorCopy }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          {copy.common.admin}
        </Link>
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
          })}
        >
          {copy.common.gardenJournal}
        </Link>
      </div>
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.adminUsers.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {copy.adminUsers.description}
        </p>
      </div>
    </header>
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

function reasonLabel(
  copy: OperatorCopy,
  reason: AdminRoleChangeReason | "manual_bootstrap",
) {
  return copy.adminUsers.reasons[reason];
}

function userReference(copy: OperatorCopy, userId: string) {
  return formatOperatorTemplate(copy.adminUsers.userReference, {
    prefix: userId.slice(0, 8),
    suffix: userId.slice(-4),
  });
}

function roleTransitionLabel(
  locale: InterfaceLocale,
  copy: OperatorCopy,
  entry: AdminRoleAuditReadModel,
) {
  if (entry.action === "revoke") {
    return entry.previousRole
      ? operatorRoleLabel(locale, entry.previousRole)
      : copy.adminUsers.roleFallback;
  }

  if (entry.previousRole && entry.newRole) {
    return `${operatorRoleLabel(locale, entry.previousRole)} -> ${operatorRoleLabel(locale, entry.newRole)}`;
  }

  return entry.newRole
    ? operatorRoleLabel(locale, entry.newRole)
    : copy.adminUsers.roleFallback;
}
