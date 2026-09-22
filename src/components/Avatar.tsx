import type { User } from '@/lib/types';

export function Avatar({ user, size = 24 }: { user: Pick<User, 'name' | 'color'>; size?: number }) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.42 }}
      title={user.name}
    >
      {initials || '?'}
    </span>
  );
}
