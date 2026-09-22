'use client';
import { useEffect, useState } from 'react';
import { Check, LogIn, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { api, useCurrentUser, useSession } from '@/lib/client/session';
import { ProjectMeta, Role, ROLE_INFO, User, USER_COLORS } from '@openrive/shared';
import { Modal } from '@openrive/ui';

export default function UsersPage() {
  const { users, refresh, switchUser, loaded } = useSession();
  const me = useCurrentUser();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  useEffect(() => {
    if (!loaded) refresh();
    api.json<ProjectMeta[]>('/api/projects').then(setProjects);
  }, [loaded, refresh]);

  const isAdmin = me?.role === 'admin';

  const save = async (id: string | null, data: Partial<User>) => {
    setError(null);
    try {
      if (id) await api.json(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      else await api.json('/api/users', { method: 'POST', body: JSON.stringify(data) });
      setEditing(null);
      setAdding(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (u: User, transferTo: string) => {
    setError(null);
    try {
      await api.json(`/api/users/${u.id}?transferTo=${encodeURIComponent(transferTo)}`, { method: 'DELETE' });
      setDeleting(null);
      await refresh();
      setProjects(await api.json<ProjectMeta[]>('/api/projects'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-6 py-6">
        <div className="flex items-center mb-2">
          <h1 className="text-[20px] font-semibold">Users</h1>
          <div className="flex-1" />
          <button className="btn btn-primary" disabled={!isAdmin} onClick={() => setAdding(true)}>
            <Plus size={14} /> Add user
          </button>
        </div>
        <p className="text-t2 mb-6 max-w-[640px]">
          Everything stays on this computer. There are no passwords: pick a user from the switcher at the top right to act as
          them. Roles decide what each user can do with files.
          {!isAdmin && ' Only admins can add, edit or remove users.'}
        </p>

        {error && <div className="mb-4 px-3 py-2 rounded-md bg-[#3a1f1f] text-[#ffb4b4]">{error}</div>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
            <div key={r} className="bg-bg1 border border-line rounded-lg p-3">
              <div className="font-semibold mb-1">{ROLE_INFO[r].label}</div>
              <div className="text-t2">{ROLE_INFO[r].description}</div>
            </div>
          ))}
        </div>

        <div className="bg-bg1 border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_90px_120px_150px] px-4 h-9 items-center text-t2 border-b border-line">
            <span>Name</span>
            <span>Role</span>
            <span>Files</span>
            <span>Created</span>
            <span />
          </div>
          {adding && <UserRow onCancel={() => setAdding(false)} onSave={(d) => save(null, d)} />}
          {users.map((u) =>
            editing === u.id ? (
              <UserRow key={u.id} user={u} onCancel={() => setEditing(null)} onSave={(d) => save(u.id, d)} />
            ) : (
              <div key={u.id} className="grid grid-cols-[1fr_140px_90px_120px_150px] px-4 h-14 items-center border-b border-line last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={u} size={30} />
                  <div className="min-w-0">
                    <div className="font-medium truncate text-[13px]">{u.name}</div>
                    {u.id === me?.id && <div className="text-ok text-[11px]">Active user</div>}
                  </div>
                </div>
                <span>{ROLE_INFO[u.role].label}</span>
                <span className="text-t1">{projects.filter((p) => p.ownerId === u.id).length}</span>
                <span className="text-t2">{new Date(u.createdAt).toLocaleDateString()}</span>
                <div className="flex justify-end gap-1">
                  {u.id !== me?.id && (
                    <button className="btn h-7 px-2" onClick={() => switchUser(u.id)} title="Act as this user">
                      <LogIn size={13} /> Switch
                    </button>
                  )}
                  <button className="icon-btn" disabled={!isAdmin} onClick={() => setEditing(u.id)} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button className="icon-btn" disabled={!isAdmin || users.length < 2} onClick={() => setDeleting(u)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </main>

      {deleting && (
        <DeleteDialog
          user={deleting}
          users={users.filter((u) => u.id !== deleting.id)}
          fileCount={projects.filter((p) => p.ownerId === deleting.id).length}
          onCancel={() => setDeleting(null)}
          onConfirm={(to) => remove(deleting, to)}
        />
      )}
    </div>
  );
}

function UserRow({ user, onSave, onCancel }: { user?: User; onSave: (d: Partial<User>) => void; onCancel: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'editor');
  const [color, setColor] = useState(() => user?.color ?? USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);
  return (
    <div className="px-4 py-3 border-b border-line bg-bg2 flex items-center gap-3 flex-wrap">
      <Avatar user={{ name: name || '?', color }} size={30} />
      <input
        autoFocus
        className="field w-48 h-8"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave({ name, role, color })}
      />
      <select className="field w-32 h-8" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_INFO[r].label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        {USER_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full"
            style={{ background: c, outline: c === color ? '2px solid white' : 'none', outlineOffset: 1 }}
          />
        ))}
      </div>
      <div className="flex-1" />
      <button className="btn" onClick={onCancel}>
        <X size={14} /> Cancel
      </button>
      <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave({ name, role, color })}>
        <Check size={14} /> {user ? 'Save' : 'Add user'}
      </button>
    </div>
  );
}

function DeleteDialog({
  user,
  users,
  fileCount,
  onCancel,
  onConfirm,
}: {
  user: User;
  users: User[];
  fileCount: number;
  onCancel: () => void;
  onConfirm: (transferTo: string) => void;
}) {
  const [to, setTo] = useState(users.find((u) => u.role === 'admin')?.id ?? users[0]?.id ?? '');
  return (
    <Modal
      title={`Delete ${user.name}?`}
      width={400}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={() => onConfirm(to)}>
            Delete user
          </button>
        </>
      }
    >
      <div className="p-4">
        <p className="text-t2 mb-4">
          {fileCount
            ? `${user.name} owns ${fileCount} file${fileCount > 1 ? 's' : ''}. Choose who takes them over.`
            : 'This user owns no files.'}
        </p>
        {fileCount > 0 && (
          <select className="field h-8" value={to} onChange={(e) => setTo(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_INFO[u.role].label})
              </option>
            ))}
          </select>
        )}
      </div>
    </Modal>
  );
}
