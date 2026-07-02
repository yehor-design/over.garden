export const ADMIN_ROLES = ["owner", "admin", "moderator", "viewer"] as const;
export const MANAGEABLE_ADMIN_ROLES = ["admin", "moderator", "viewer"] as const;
export const ADMIN_ROLE_CHANGE_REASONS = [
  "manual_owner_grant",
  "pilot_operator_delegation",
  "temporary_coverage",
  "role_cleanup",
  "access_revoked",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type ManageableAdminRole = (typeof MANAGEABLE_ADMIN_ROLES)[number];
export type AdminRoleChangeReason = (typeof ADMIN_ROLE_CHANGE_REASONS)[number];

export type AdminCapability =
  | "admin:read"
  | "admin:manage_roles"
  | "operator:read"
  | "operator:mutate"
  | "erasure:execute";

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ADMIN_ROLES.includes(value as AdminRole);
}

export function isManageableAdminRole(
  value: unknown,
): value is ManageableAdminRole {
  return (
    typeof value === "string" &&
    MANAGEABLE_ADMIN_ROLES.includes(value as ManageableAdminRole)
  );
}

export function isAdminRoleChangeReason(
  value: unknown,
): value is AdminRoleChangeReason {
  return (
    typeof value === "string" &&
    ADMIN_ROLE_CHANGE_REASONS.includes(value as AdminRoleChangeReason)
  );
}

export function capabilitiesForAdminRole(role: AdminRole): AdminCapability[] {
  switch (role) {
    case "owner":
      return [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ];
    case "admin":
      return [
        "admin:read",
        "operator:read",
        "operator:mutate",
        "erasure:execute",
      ];
    case "moderator":
      return ["admin:read", "operator:read", "operator:mutate"];
    case "viewer":
      return ["admin:read", "operator:read"];
  }
}
