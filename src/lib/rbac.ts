import type { AccessGrant, Department, Person, Role } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// RBAC — this is the one file that should be audited if anything about
// LeadFlow visibility ever looks wrong. The rule is enforced by DATA
// (department.isRestricted + explicit, expiring AccessGrant rows),
// never by string-matching a department's name.
//
// IMPORTANT (production note): in this scaffold, "current person / role"
// is selected client-side via a demo role-switcher (see RoleContext) so the
// whole system is explorable without standing up real auth. That is NOT
// how this should ship. Before this touches real company data, replace the
// role source with a server-verified session (NextAuth/Clerk/etc.) — every
// function below already takes `person`/`role` as plain data, so swapping
// the source is a one-line change at the call sites, not a rewrite of the
// permission logic itself.
// ─────────────────────────────────────────────────────────────────────────

export function isSuperadmin(role: Role | undefined): boolean {
  return role?.name === "superadmin";
}

export function canSeeDepartment(
  person: Person,
  role: Role,
  department: Department,
  grants: AccessGrant[]
): boolean {
  if (!department.isRestricted) {
    // Normal branch-visibility rule: anyone attached to the branch/department,
    // or any developer, can see non-restricted department data.
    return true;
  }

  // Restricted (LeadFlow-style) department: closed by default.
  if (isSuperadmin(role)) return true;

  const now = Date.now();
  const explicitGrant = grants.find(
    (g) =>
      g.personId === person.id &&
      g.targetType === "department" &&
      g.targetId === department.id &&
      (!g.expiresAt || new Date(g.expiresAt).getTime() > now)
  );

  return Boolean(explicitGrant);
}

export function canSeeProject(
  person: Person,
  role: Role,
  projectBranchId: string,
  grants: AccessGrant[],
  projectId: string
): boolean {
  if (isSuperadmin(role)) return true;
  if (role.name === "developer" && person.branchIds.includes(projectBranchId)) return true;

  return grants.some(
    (g) => g.personId === person.id && g.targetType === "project" && g.targetId === projectId
  );
}

export function visibleDepartments(
  person: Person,
  role: Role,
  departments: Department[],
  grants: AccessGrant[]
): Department[] {
  return departments.filter((d) => canSeeDepartment(person, role, d, grants));
}
