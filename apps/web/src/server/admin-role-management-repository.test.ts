import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  ADMIN_LAST_OWNER_PROTECTION_MESSAGE,
  ADMIN_ROLE_TARGET_REQUIRES_CREDENTIAL_ONLY_MESSAGE,
  grantAdminRole,
  hashAdminActorSessionId,
  readAdminRoleManagementView,
  revokeAdminRole,
} from "./admin-role-management-repository";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const MODERATOR_ID = "00000000-0000-4000-8000-000000000003";

describe("admin role management repository", () => {
  it("hashes actor session ids instead of storing raw session ids", () => {
    const hash = hashAdminActorSessionId("session-secret-value");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("session-secret-value");
    expect(hashAdminActorSessionId(null)).toBeNull();
  });

  it("lets an owner grant a role and writes a bounded audit row", async () => {
    const state = createState({
      users: [OWNER_ID, MODERATOR_ID],
      roles: [{ userId: OWNER_ID, role: "owner" }],
    });

    await grantAdminRole(
      scopedToUser(OWNER_ID, "owner-session"),
      {
        targetUserId: MODERATOR_ID,
        role: "moderator",
        reason: "pilot_operator_delegation",
      },
      fakeAdminRoleDb(state),
    );

    expect(state.roles.get(MODERATOR_ID)).toMatchObject({
      role: "moderator",
      granted_by_user_id: OWNER_ID,
      grant_reason: "pilot_operator_delegation",
    });
    expect(state.audit).toEqual([
      expect.objectContaining({
        actor_user_id: OWNER_ID,
        target_user_id: MODERATOR_ID,
        action: "grant",
        previous_role: null,
        new_role: "moderator",
        reason: "pilot_operator_delegation",
      }),
    ]);
    expect(state.audit[0]?.actor_session_id_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state.audit)).not.toContain("owner-session");
  });

  it("requires owner capability before reading role management rows", async () => {
    const ownerState = createState({
      users: [OWNER_ID, MODERATOR_ID],
      roles: [
        { userId: OWNER_ID, role: "owner" },
        { userId: MODERATOR_ID, role: "moderator" },
      ],
    });
    ownerState.audit.push({
      id: "audit-1",
      actor_user_id: OWNER_ID,
      target_user_id: MODERATOR_ID,
      action: "grant",
      previous_role: null,
      new_role: "moderator",
      reason: "pilot_operator_delegation",
      created_at: new Date("2026-07-02T00:00:00.000Z"),
    });

    await expect(
      readAdminRoleManagementView(
        scopedToUser(MODERATOR_ID, "moderator-session"),
        fakeAdminRoleDb(ownerState),
      ),
    ).rejects.toThrow("Admin access denied.");

    const view = await readAdminRoleManagementView(
      scopedToUser(OWNER_ID, "owner-session"),
      fakeAdminRoleDb(ownerState),
    );

    expect(view.assignments).toHaveLength(2);
    expect(view.auditEntries).toHaveLength(1);
  });

  it("rejects non-owner role grants before mutating role rows", async () => {
    const state = createState({
      users: [ADMIN_ID, MODERATOR_ID],
      roles: [{ userId: ADMIN_ID, role: "admin" }],
    });

    await expect(
      grantAdminRole(
        scopedToUser(ADMIN_ID, "admin-session"),
        {
          targetUserId: MODERATOR_ID,
          role: "moderator",
          reason: "pilot_operator_delegation",
        },
        fakeAdminRoleDb(state),
      ),
    ).rejects.toThrow("Admin access denied.");

    expect(state.roles.has(MODERATOR_ID)).toBe(false);
    expect(state.audit).toEqual([]);
  });

  it("rejects role grants to social-linked users before mutating role rows", async () => {
    const state = createState({
      users: [OWNER_ID, MODERATOR_ID],
      roles: [{ userId: OWNER_ID, role: "owner" }],
      accounts: {
        [MODERATOR_ID]: ["credential", "google"],
      },
    });

    await expect(
      grantAdminRole(
        scopedToUser(OWNER_ID, "owner-session"),
        {
          targetUserId: MODERATOR_ID,
          role: "moderator",
          reason: "pilot_operator_delegation",
        },
        fakeAdminRoleDb(state),
      ),
    ).rejects.toThrow(ADMIN_ROLE_TARGET_REQUIRES_CREDENTIAL_ONLY_MESSAGE);

    expect(state.roles.has(MODERATOR_ID)).toBe(false);
    expect(state.audit).toEqual([]);
  });

  it("prevents downgrading or revoking the last owner", async () => {
    const grantState = createState({
      users: [OWNER_ID],
      roles: [{ userId: OWNER_ID, role: "owner" }],
    });

    await expect(
      grantAdminRole(
        scopedToUser(OWNER_ID, "owner-session"),
        {
          targetUserId: OWNER_ID,
          role: "admin",
          reason: "role_cleanup",
        },
        fakeAdminRoleDb(grantState),
      ),
    ).rejects.toThrow(ADMIN_LAST_OWNER_PROTECTION_MESSAGE);

    expect(grantState.roles.get(OWNER_ID)?.role).toBe("owner");
    expect(grantState.audit).toEqual([]);

    const revokeState = createState({
      users: [OWNER_ID],
      roles: [{ userId: OWNER_ID, role: "owner" }],
    });

    await expect(
      revokeAdminRole(
        scopedToUser(OWNER_ID, "owner-session"),
        {
          targetUserId: OWNER_ID,
          reason: "access_revoked",
        },
        fakeAdminRoleDb(revokeState),
      ),
    ).rejects.toThrow(ADMIN_LAST_OWNER_PROTECTION_MESSAGE);

    expect(revokeState.roles.get(OWNER_ID)?.role).toBe("owner");
    expect(revokeState.audit).toEqual([]);
  });

  it("revokes delegated roles and writes an audit row", async () => {
    const state = createState({
      users: [OWNER_ID, MODERATOR_ID],
      roles: [
        { userId: OWNER_ID, role: "owner" },
        { userId: MODERATOR_ID, role: "moderator" },
      ],
    });

    await revokeAdminRole(
      scopedToUser(OWNER_ID, "owner-session"),
      {
        targetUserId: MODERATOR_ID,
        reason: "access_revoked",
      },
      fakeAdminRoleDb(state),
    );

    expect(state.roles.has(MODERATOR_ID)).toBe(false);
    expect(state.audit).toEqual([
      expect.objectContaining({
        actor_user_id: OWNER_ID,
        target_user_id: MODERATOR_ID,
        action: "revoke",
        previous_role: "moderator",
        new_role: null,
        reason: "access_revoked",
      }),
    ]);
  });
});

type RoleRow = {
  userId: string;
  role: string;
};

type FakeState = {
  users: Set<string>;
  accounts: Map<string, string[]>;
  roles: Map<
    string,
    {
      user_id: string;
      role: string;
      granted_by_user_id: string | null;
      grant_reason: string;
      granted_at: Date;
      updated_at: Date;
    }
  >;
  audit: Array<Record<string, unknown>>;
};

function createState(input: {
  users: string[];
  roles: RoleRow[];
  accounts?: Record<string, string[]>;
}): FakeState {
  const now = new Date("2026-07-02T00:00:00.000Z");
  return {
    users: new Set(input.users),
    accounts: new Map(
      input.users.map((userId) => [
        userId,
        input.accounts?.[userId] ?? ["credential"],
      ]),
    ),
    roles: new Map(
      input.roles.map((row) => [
        row.userId,
        {
          user_id: row.userId,
          role: row.role,
          granted_by_user_id: null,
          grant_reason: "manual_bootstrap",
          granted_at: now,
          updated_at: now,
        },
      ]),
    ),
    audit: [],
  };
}

function fakeAdminRoleDb(state: FakeState): Kysely<Database> {
  const fake = {
    transaction: () => ({
      execute: async <T>(callback: (trx: typeof fake) => Promise<T>) =>
        callback(fake),
    }),
    selectFrom: (table: string) => createSelectBuilder(state, table),
    insertInto: (table: string) => createInsertBuilder(state, table),
    deleteFrom: (table: string) => createDeleteBuilder(state, table),
  };

  return fake as unknown as Kysely<Database>;
}

function createSelectBuilder(state: FakeState, table: string) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const builder = {
    select: () => builder,
    where: (column: string, _operator: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    orderBy: () => builder,
    limit: () => builder,
    forUpdate: () => builder,
    executeTakeFirst: async () => {
      const rows = await builder.execute();
      return rows[0];
    },
    execute: async () => {
      if (table === "user") {
        return [...state.users]
          .filter((id) => matches(filters, "id", id))
          .map((id) => ({ id }));
      }

      if (table === "admin_user_roles") {
        return [...state.roles.values()].filter(
          (row) =>
            matches(filters, "user_id", row.user_id) &&
            matches(filters, "role", row.role),
        );
      }

      if (table === "account") {
        return [...state.accounts.entries()]
          .filter(([userId]) => matches(filters, "userId", userId))
          .flatMap(([, providers]) =>
            providers.map((providerId) => ({ providerId })),
          );
      }

      if (table === "admin_role_audit_log") {
        return state.audit;
      }

      return [];
    },
  };

  return builder;
}

function createInsertBuilder(state: FakeState, table: string) {
  let storedValues: Record<string, unknown> = {};
  const builder = {
    values: (values: Record<string, unknown>) => {
      storedValues = values;
      return builder;
    },
    onConflict: () => builder,
    execute: async () => {
      if (table === "admin_user_roles") {
        const userId = String(storedValues.user_id);
        const now = new Date("2026-07-02T00:00:00.000Z");
        const current = state.roles.get(userId);
        state.roles.set(userId, {
          user_id: userId,
          role: String(storedValues.role),
          granted_by_user_id: String(storedValues.granted_by_user_id),
          grant_reason: String(storedValues.grant_reason),
          granted_at: current?.granted_at ?? now,
          updated_at: now,
        });
      }

      if (table === "admin_role_audit_log") {
        state.audit.push({
          id: `audit-${state.audit.length + 1}`,
          created_at: new Date("2026-07-02T00:00:00.000Z"),
          ...storedValues,
        });
      }
    },
  };

  return builder;
}

function createDeleteBuilder(state: FakeState, table: string) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const builder = {
    where: (column: string, _operator: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    execute: async () => {
      if (table === "admin_user_roles") {
        for (const row of [...state.roles.values()]) {
          if (matches(filters, "user_id", row.user_id)) {
            state.roles.delete(row.user_id);
          }
        }
      }
    },
  };

  return builder;
}

function matches(
  filters: Array<{ column: string; value: unknown }>,
  column: string,
  actual: unknown,
) {
  return filters
    .filter((filter) => filter.column === column)
    .every((filter) => filter.value === actual);
}
