export const ADMIN_ROLES = ["owner", "admin", "moderator", "viewer"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminCapability =
  | "admin:read"
  | "admin:manage_roles"
  | "operator:read"
  | "operator:mutate";

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && ADMIN_ROLES.includes(value as AdminRole);
}

export function capabilitiesForAdminRole(role: AdminRole): AdminCapability[] {
  switch (role) {
    case "owner":
      return [
        "admin:read",
        "admin:manage_roles",
        "operator:read",
        "operator:mutate",
      ];
    case "admin":
      return ["admin:read", "operator:read", "operator:mutate"];
    case "moderator":
      return ["admin:read", "operator:read", "operator:mutate"];
    case "viewer":
      return ["admin:read", "operator:read"];
  }
}
