import { WORKSPACE_ROLE_VALUES, type ProjectMeta, type Role, type User } from './types';

export const WORKSPACE_ROLES = WORKSPACE_ROLE_VALUES;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspaceCapability =
  | 'readProjects'
  | 'createProjects'
  | 'editProjects'
  | 'manageProjects'
  | 'manageMembers'
  | 'inviteMembers'
  | 'manageInvitations'
  | 'renameWorkspace'
  | 'deleteWorkspace'
  | 'transferOwnership'
  | 'assignAdministrators';

export type AccountCapability = 'readAllPersonalProjects' | 'createPersonalProjects' | 'manageAccounts' | 'manageAllProjects' | 'transferProjects' | 'createWorkspaces';

const ACCOUNT_CAPABILITIES: Record<Role, readonly AccountCapability[]> = {
  admin: ['readAllPersonalProjects', 'createPersonalProjects', 'manageAccounts', 'manageAllProjects', 'transferProjects', 'createWorkspaces'],
  editor: ['createPersonalProjects', 'createWorkspaces'],
  viewer: ['readAllPersonalProjects'],
};

export function hasAccountCapability(role: Role, capability: AccountCapability): boolean {
  return ACCOUNT_CAPABILITIES[role]?.includes(capability) ?? false;
}

const WORKSPACE_CAPABILITIES: Record<WorkspaceRole, readonly WorkspaceCapability[]> = {
  owner: [
    'readProjects', 'createProjects', 'editProjects', 'manageProjects', 'manageMembers', 'inviteMembers', 'manageInvitations',
    'renameWorkspace', 'deleteWorkspace', 'transferOwnership', 'assignAdministrators',
  ],
  admin: ['readProjects', 'createProjects', 'editProjects', 'manageProjects', 'manageMembers', 'inviteMembers', 'manageInvitations', 'renameWorkspace'],
  editor: ['readProjects', 'createProjects', 'editProjects'],
  viewer: ['readProjects'],
};

/** Better Auth permits comma-separated role assignments; unknown roles grant no access. */
export function hasWorkspaceCapability(role: string | null | undefined, capability: WorkspaceCapability): boolean {
  if (!role) return false;
  return role.split(',').some((value) =>
    WORKSPACE_ROLES.includes(value.trim() as WorkspaceRole)
      && WORKSPACE_CAPABILITIES[value.trim() as WorkspaceRole].includes(capability),
  );
}

export function workspaceCapabilitiesForRole(role: WorkspaceRole): readonly WorkspaceCapability[] {
  return WORKSPACE_CAPABILITIES[role];
}

export function workspaceRoleForDisplay(role: string | null | undefined): WorkspaceRole | null {
  if (!role) return null;
  return WORKSPACE_ROLES.find((candidate) => role.split(',').some((assigned) => assigned.trim() === candidate)) ?? null;
}

type Principal = Pick<User, 'id' | 'role'> & Partial<Pick<User, 'activeOrganizationId' | 'activeOrganizationRole'>>;

export type ProjectCapability = 'read' | 'edit' | 'manage' | 'share' | 'transfer';

/** The single project-access policy used by browser, API, CLI and MCP layers. */
export function canAccessProject(user: Principal | null | undefined, project: ProjectMeta, capability: ProjectCapability): boolean {
  if (!user) return false;
  const globalAdministrator = hasAccountCapability(user.role, 'manageAllProjects');

  if (project.organizationId) {
    if (globalAdministrator) return capability === 'read' || capability === 'edit' || capability === 'manage';
    if (user.activeOrganizationId !== project.organizationId) return false;
    switch (capability) {
      case 'read': return hasWorkspaceCapability(user.activeOrganizationRole, 'readProjects');
      case 'edit': return hasWorkspaceCapability(user.activeOrganizationRole, 'editProjects');
      case 'manage': return hasWorkspaceCapability(user.activeOrganizationRole, 'manageProjects');
      case 'share': return false;
      case 'transfer': return false;
    }
  }

  if (globalAdministrator) return true;

  switch (capability) {
    case 'read':
      return hasAccountCapability(user.role, 'readAllPersonalProjects') || project.ownerId === user.id || !!project.sharedWith?.includes(user.id);
    case 'edit':
      return hasAccountCapability(user.role, 'createPersonalProjects') && (project.ownerId === user.id || !!project.sharedWith?.includes(user.id));
    case 'manage':
      return hasAccountCapability(user.role, 'createPersonalProjects') && project.ownerId === user.id;
    case 'share':
      return hasAccountCapability(user.role, 'createPersonalProjects') && project.ownerId === user.id;
    case 'transfer':
      return false;
  }
}

/** New files go into the selected workspace by default; pass null for personal files. */
export function canCreateProject(user: Principal | null | undefined, organizationId: string | null | undefined = user?.activeOrganizationId): boolean {
  if (!user) return false;
  if (hasAccountCapability(user.role, 'manageAllProjects')) return true;
  if (organizationId) {
    return user.activeOrganizationId === organizationId
      && hasWorkspaceCapability(user.activeOrganizationRole, 'createProjects');
  }
  return hasAccountCapability(user.role, 'createPersonalProjects');
}

export function canCreateWorkspace(user: { role: string } | null | undefined): boolean {
  return !!user && isAccountRole(user.role) && hasAccountCapability(user.role, 'createWorkspaces');
}

export function canTransferProject(user: Principal | null | undefined): boolean {
  return !!user && hasAccountCapability(user.role, 'transferProjects');
}

export function canManageAccounts(role: Role): boolean {
  return hasAccountCapability(role, 'manageAccounts');
}

export function isAdministratorRole(role: string): boolean {
  return isAccountRole(role) && canManageAccounts(role);
}

export function isActiveAdministrator(user: { role: string; disabled?: boolean; banned?: boolean }): boolean {
  return isAdministratorRole(user.role) && !user.disabled && !user.banned;
}

export function canManageWorkspace(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'manageMembers');
}

export function canInviteWorkspaceMembers(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'inviteMembers');
}

export function canManageWorkspaceInvitations(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'manageInvitations');
}

export function canAssignWorkspaceAdministrators(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'assignAdministrators');
}

export function canAssignWorkspaceRole(actorRole: string | null | undefined, targetRole: string, currentRole?: string | null): boolean {
  if (!canManageWorkspace(actorRole)) return false;
  if (currentRole && canDeleteWorkspace(currentRole)) return false;
  if (currentRole && canManageWorkspace(currentRole) && !canAssignWorkspaceAdministrators(actorRole)) return false;
  return targetRole === 'admin'
    ? canAssignWorkspaceAdministrators(actorRole)
    : targetRole === 'editor' || targetRole === 'viewer';
}

export function canRenameWorkspace(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'renameWorkspace');
}

export function canDeleteWorkspace(role: string | null | undefined): boolean {
  return hasWorkspaceCapability(role, 'deleteWorkspace');
}

export function isAccountRole(role: string): role is Role {
  return role === 'admin' || role === 'editor' || role === 'viewer';
}
