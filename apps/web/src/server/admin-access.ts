import "server-only";

import type { Kysely } from "kysely";

import { db as defaultDb } from "@/db";
import type { Database } from "@/db/schema";
import {
  capabilitiesForAdminRole,
  isAdminRole,
  type AdminCapability,
  type AdminRole,
} from "@/lib/admin/roles";
import {
  isVerifiedCredentialOnlyOwnerAccount,
  OWNER_CREDENTIAL_PROVIDER_ID,
  resolveConfiguredSealedOwnerUserId,
  SEALED_OWNER_USER_ID_ENV,
} from "@/lib/admin/owner-account-contract";
import type { RequestScope } from "@/server/request-scope";

export const ADMIN_ACCESS_DENIED_MESSAGE = "Admin access denied.";

/**
 * A refusal, told apart from an infrastructure failure.
 *
 * `resolveAdminCapabilityAccess` collapses every rejection onto `denied`, which
 * is right for a gate but wrong for a screen: telling the owner "access denied"
 * when the role table was simply unreachable sends them to look at permissions
 * while the real fault is the database. A workspace surface (ADR-0023) needs to
 * separate the two, so the refusal carries a type. The message is unchanged, so
 * every existing caller and assertion behaves exactly as before.
 */
export class AdminAccessDeniedError extends Error {
  constructor(message: string = ADMIN_ACCESS_DENIED_MESSAGE) {
    super(message);
    this.name = "AdminAccessDeniedError";
  }
}
export const ADMIN_CREDENTIAL_PROVIDER_ID = OWNER_CREDENTIAL_PROVIDER_ID;
export const ADMIN_SEALED_OWNER_USER_ID_ENV = SEALED_OWNER_USER_ID_ENV;
export const ADMIN_ROLE_RESOLUTION_DEADLINE_MS = 2_000;

export interface AdminAccess {
  mode: "sealed_owner_credential_only";
  role: AdminRole;
  capabilities: AdminCapability[];
}

export type AdminEntryAccess =
  | { status: "sign_in_required" }
  | { status: "denied" }
  | ({ status: "allowed" } & AdminAccess);

export type BoundedAdminEntryAccess =
  | AdminEntryAccess
  | { status: "timed_out" }
  | { status: "cancelled" };

export interface AdminRoleResolutionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function readAdminRoleForUser(
  database: Kysely<Database>,
  userId: string,
): Promise<AdminRole | null> {
  const row = await database
    .selectFrom("admin_user_roles")
    .select("role")
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!isAdminRole(row?.role)) return null;
  return row.role;
}

export async function assertAdminAccess(
  scope: RequestScope,
  database: Kysely<Database> = defaultDb,
): Promise<AdminAccess> {
  const role = await readAdminRoleForUser(database, scope.userId);

  if (!role) {
    throw new AdminAccessDeniedError();
  }

  assertSealedOwner(scope.userId, role);
  await assertCredentialOnlyAdminAccount(database, scope.userId);

  return {
    mode: "sealed_owner_credential_only",
    role,
    capabilities: capabilitiesForAdminRole(role),
  };
}

export async function resolveAdminAccess(
  scope: RequestScope | null,
  database: Kysely<Database> = defaultDb,
): Promise<AdminEntryAccess> {
  if (!scope) return { status: "sign_in_required" };

  try {
    const access = await assertAdminAccess(scope, database);
    return { status: "allowed", ...access };
  } catch {
    return { status: "denied" };
  }
}

export function assertAdminCapability(
  access: AdminAccess,
  capability: AdminCapability,
) {
  if (!access.capabilities.includes(capability)) {
    throw new AdminAccessDeniedError();
  }
}

export function hasAdminCapability(
  access: AdminAccess,
  capability: AdminCapability,
) {
  return access.capabilities.includes(capability);
}

export async function assertAdminCapabilityForScope(
  scope: RequestScope,
  capability: AdminCapability,
  database: Kysely<Database> = defaultDb,
): Promise<AdminAccess> {
  const access = await assertAdminAccess(scope, database);
  assertAdminCapability(access, capability);
  return access;
}

export async function resolveAdminCapabilityAccess(
  scope: RequestScope | null,
  capability: AdminCapability,
  database: Kysely<Database> = defaultDb,
): Promise<AdminEntryAccess> {
  if (!scope) return { status: "sign_in_required" };

  try {
    const access = await assertAdminCapabilityForScope(
      scope,
      capability,
      database,
    );
    return { status: "allowed", ...access };
  } catch {
    return { status: "denied" };
  }
}

export async function resolveAdminCapabilityAccessBounded(
  scope: RequestScope | null,
  capability: AdminCapability,
  database: Kysely<Database> = defaultDb,
  options: AdminRoleResolutionOptions = {},
): Promise<BoundedAdminEntryAccess> {
  if (options.signal?.aborted) return { status: "cancelled" };

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? ADMIN_ROLE_RESOLUTION_DEADLINE_MS, 1),
    ADMIN_ROLE_RESOLUTION_DEADLINE_MS,
  );

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: BoundedAdminEntryAccess) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      resolve(result);
    };
    const cancel = () => finish({ status: "cancelled" });

    const timer = setTimeout(() => finish({ status: "timed_out" }), timeoutMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    void resolveAdminCapabilityAccess(scope, capability, database).then(
      finish,
      () => finish({ status: "denied" }),
    );
  });
}

export async function assertCredentialOnlyAdminAccount(
  database: Kysely<Database>,
  userId: string,
) {
  const [user, accounts] = await Promise.all([
    database
      .selectFrom("user")
      .select("emailVerified")
      .where("id", "=", userId)
      .executeTakeFirst(),
    database
      .selectFrom("account")
      .select(["providerId", "password"])
      .where("userId", "=", userId)
      .execute(),
  ]);

  if (
    !user ||
    !isVerifiedCredentialOnlyOwnerAccount({
      emailVerified: user.emailVerified,
      accounts,
    })
  ) {
    throw new AdminAccessDeniedError();
  }
}

export function resolveSealedAdminOwnerUserId(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = resolveConfiguredSealedOwnerUserId(env);
  if (!configured) {
    throw new AdminAccessDeniedError();
  }

  return configured;
}

function assertSealedOwner(userId: string, role: AdminRole) {
  const sealedOwnerUserId = resolveSealedAdminOwnerUserId();

  if (role !== "owner" || userId !== sealedOwnerUserId) {
    throw new AdminAccessDeniedError();
  }
}
