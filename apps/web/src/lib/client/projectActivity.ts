const STORAGE_PREFIX = 'openrive:project-activity:';
const RECENT_LIMIT = 100;

interface ProjectActivity {
  favorites: string[];
  recent: { id: string; openedAt: number }[];
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function read(userId: string): ProjectActivity {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '{}');
    if (!value || typeof value !== 'object') return { favorites: [], recent: [] };
    const data = value as Partial<ProjectActivity>;
    return {
      favorites: Array.isArray(data.favorites) ? data.favorites.filter((id): id is string => typeof id === 'string') : [],
      recent: Array.isArray(data.recent)
        ? data.recent.filter((entry): entry is ProjectActivity['recent'][number] =>
            !!entry && typeof entry.id === 'string' && Number.isFinite(entry.openedAt),
          )
        : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

function write(userId: string, activity: ProjectActivity) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(activity));
  } catch {
    // These conveniences remain optional when browser storage is unavailable.
  }
}

export function getProjectActivity(userId: string): ProjectActivity {
  return read(userId);
}

export function setProjectFavorite(userId: string, projectId: string, favorite: boolean): ProjectActivity {
  const activity = read(userId);
  const favorites = new Set(activity.favorites);
  if (favorite) favorites.add(projectId);
  else favorites.delete(projectId);
  const next = { ...activity, favorites: [...favorites] };
  write(userId, next);
  return next;
}

export function recordProjectOpen(userId: string, projectId: string, openedAt = Date.now()): ProjectActivity {
  const activity = read(userId);
  const recent = [
    { id: projectId, openedAt },
    ...activity.recent.filter((entry) => entry.id !== projectId),
  ].slice(0, RECENT_LIMIT);
  const next = { ...activity, recent };
  write(userId, next);
  return next;
}
