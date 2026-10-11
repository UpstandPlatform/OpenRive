import assert from 'node:assert/strict';
import {
  canAccessProject,
  canAssignWorkspaceRole,
  canCreateProject,
  canCreateWorkspace,
  canDeleteWorkspace,
  canManageAccounts,
  canManageWorkspace,
  canRenameWorkspace,
  canTransferProject,
  hasWorkspaceCapability,
  userSchema,
  workspaceRoleSchema,
  type ProjectMeta,
  type User,
} from '@openrive/shared';

const personal: ProjectMeta = { id: 'personal', name: 'Private', ownerId: 'editor', createdAt: 1, updatedAt: 1 };
const shared: ProjectMeta = { ...personal, id: 'shared', ownerId: 'owner', sharedWith: ['editor'] };
const workspace: ProjectMeta = { ...personal, id: 'team', ownerId: 'creator', organizationId: 'org-a' };
const account = (id: string, role: User['role'], activeOrganizationId?: string, activeOrganizationRole?: string): User => ({
  id,
  name: id,
  color: '#7c5cff',
  role,
  createdAt: 1,
  ...(activeOrganizationId ? { activeOrganizationId } : {}),
  ...(activeOrganizationRole ? { activeOrganizationRole } : {}),
});

function check(value: unknown, message: string) {
  assert.ok(value, message);
}

function deny(value: unknown, message: string) {
  assert.ok(!value, message);
}

const admin = account('admin', 'admin');
check(canAccessProject(admin, personal, 'read'), 'global admin reads every personal project');
check(canAccessProject(admin, workspace, 'edit'), 'global admin edits every workspace project');
check(canAccessProject(admin, workspace, 'manage'), 'global admin manages every project');
deny(canAccessProject(admin, workspace, 'share'), 'workspace projects cannot be shared outside their workspace');
deny(canAccessProject(admin, workspace, 'transfer'), 'workspace project ownership stays with the workspace');
check(canAccessProject(admin, personal, 'share'), 'global admin can share a personal project');
check(canTransferProject(admin), 'global admin may transfer project ownership');
check(canCreateProject(admin), 'global admin can create in the selected workspace');

const editor = account('editor', 'editor');
check(canAccessProject(editor, personal, 'read'), 'personal owner reads their file');
check(canAccessProject(editor, personal, 'edit'), 'personal owner edits their file');
check(canAccessProject(editor, personal, 'manage'), 'personal owner manages their file');
check(canAccessProject(editor, personal, 'share'), 'personal owner can share their file');
check(canAccessProject(editor, shared, 'edit'), 'explicitly shared editors may edit');
deny(canAccessProject(editor, shared, 'manage'), 'shared editors cannot change file access or delete');
deny(canAccessProject(account('stranger', 'editor'), personal, 'read'), 'unshared personal files stay private to editors');
check(canCreateProject(editor), 'editors can create personal files');

const viewer = account('viewer', 'viewer');
check(canAccessProject(viewer, personal, 'read'), 'global viewers can read all personal files as documented');
deny(canAccessProject(account('viewer-owner', 'viewer'), { ...personal, ownerId: 'viewer-owner' }, 'edit'), 'global viewer remains read-only on owned personal files');
deny(canAccessProject(account('viewer-owner', 'viewer'), { ...personal, ownerId: 'viewer-owner' }, 'manage'), 'global viewer cannot delete or share personal files');
deny(canAccessProject(viewer, shared, 'share'), 'global viewers cannot grant access');
deny(canCreateProject(viewer), 'global viewers cannot create personal files');
deny(canCreateWorkspace(viewer), 'global viewers cannot create workspaces');

// Account roles govern personal projects. Workspace membership independently
// governs projects in that workspace, matching the documented role model.
const workspaceOwnerViewer = account('owner-viewer', 'viewer', 'org-a', 'owner');
check(canAccessProject(workspaceOwnerViewer, workspace, 'read'), 'workspace owner can read team projects regardless of account role');
check(canAccessProject(workspaceOwnerViewer, workspace, 'edit'), 'workspace owner can edit team projects regardless of account role');
check(canAccessProject(workspaceOwnerViewer, workspace, 'manage'), 'workspace owner can manage team projects');
check(canCreateProject(workspaceOwnerViewer), 'workspace owner can create in their selected workspace');
deny(canCreateProject(workspaceOwnerViewer, null), 'global viewer cannot create personal files while a workspace is selected');
check(canDeleteWorkspace('owner'), 'workspace owner can delete a workspace');
check(canRenameWorkspace('owner'), 'workspace owner can rename a workspace');
deny(canManageAccounts('viewer'), 'workspace ownership does not grant global account administration');
deny(canTransferProject(workspaceOwnerViewer), 'workspace ownership does not grant global project transfer');

const workspaceAdmin = account('team-admin', 'viewer', 'org-a', 'admin');
check(canAccessProject(workspaceAdmin, workspace, 'manage'), 'workspace admin can manage workspace projects');
check(canManageWorkspace('admin'), 'workspace admin can manage members');
check(canAssignWorkspaceRole('admin', 'editor'), 'workspace admin can assign editor');
deny(canAssignWorkspaceRole('admin', 'admin'), 'workspace admin cannot grant administrator access');
deny(canDeleteWorkspace('admin'), 'workspace admin cannot delete the workspace');
deny(canTransferProject(workspaceAdmin), 'workspace admin cannot transfer a globally owned project');

const workspaceEditor = account('team-editor', 'viewer', 'org-a', 'editor');
check(canAccessProject(workspaceEditor, workspace, 'edit'), 'workspace editor can edit team files even as a global viewer');
check(canCreateProject(workspaceEditor), 'workspace editor can create team files even as a global viewer');
deny(canAccessProject(workspaceEditor, workspace, 'manage'), 'workspace editor cannot delete or manage team files');
deny(canManageWorkspace('editor'), 'workspace editor cannot manage members');
deny(canAssignWorkspaceRole('editor', 'viewer'), 'workspace editor cannot change member roles');

const workspaceViewer = account('team-viewer', 'editor', 'org-a', 'viewer');
check(canAccessProject(workspaceViewer, workspace, 'read'), 'workspace viewer can read team files');
deny(canAccessProject(workspaceViewer, workspace, 'edit'), 'workspace viewer cannot edit team files even as global editor');
deny(canCreateProject(workspaceViewer), 'workspace viewer cannot create in the selected workspace');
check(canCreateProject(workspaceViewer, null), 'global editor can create personal files while a read-only workspace is selected');

const otherWorkspace = account('other', 'editor', 'org-b', 'owner');
deny(canAccessProject(otherWorkspace, workspace, 'read'), 'workspace access does not cross organizations');
check(canAccessProject(admin, workspace, 'read'), 'global admin can access workspaces without an active membership');
deny(canAccessProject(account('no-role', 'editor', 'org-a'), workspace, 'read'), 'workspace membership without a recognized role grants no access');
deny(canCreateProject(account('no-role', 'editor', 'org-a', 'unknown')), 'unknown workspace role cannot create files');
check(hasWorkspaceCapability('viewer,admin', 'manageProjects'), 'combined Better Auth roles grant the union of explicit capabilities');
check(canDeleteWorkspace('admin,owner'), 'combined role assignments recognize workspace ownership');
deny(hasWorkspaceCapability('unknown,', 'manageMembers'), 'unknown or malformed role assignments fail closed');

check(workspaceRoleSchema.safeParse('admin,editor').success, 'session schema accepts valid combined Better Auth roles');
deny(workspaceRoleSchema.safeParse('admin,root').success, 'session schema rejects unknown workspace roles');
check(userSchema.safeParse({ ...workspaceEditor, activeOrganizationRole: 'viewer,editor' }).success, 'user schema accepts supported role unions');

console.log('Permission matrix passed: account and workspace roles, project operations, role unions, and invalid-role denial');
