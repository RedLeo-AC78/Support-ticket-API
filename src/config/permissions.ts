import type { Role } from "../generated/prisma/enums.js";

// Politique centralisée des autorisations.
export const permissions = {
  SUPER_ADMIN: [
    "users:invite",
    "users:manage-status",
    "users:list",
    "tickets:read-all",
    "tickets:update-status",
    "tickets:create",
  ],
  ADMIN: [
    "users:list",
    "tickets:read-all",
    "tickets:update-status",
    "tickets:create",
  ],
  AGENT: ["tickets:read-all", "tickets:update-status", "tickets:create"],
  USER: ["tickets:read-own", "tickets:create"],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof permissions)[Role][number];

export function hasPermission(role: Role, permission: Permission): boolean {
  const granted: readonly string[] = permissions[role];

  return granted.includes(permission);
}
