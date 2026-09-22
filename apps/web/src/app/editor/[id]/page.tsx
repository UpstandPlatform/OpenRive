'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Editor, setKnownUpdatedAt } from '@/components/editor/Editor';
import { RiveDoc } from '@openrive/rive/document';
import { parseDoc } from '@openrive/shared/serialize';
import { canEdit, useCurrentUser, useSession } from '@/lib/client/session';
import { useEditor } from '@/lib/store/editor';
import type { ProjectMeta } from '@openrive/shared';

export default function EditorPage({ params }: PageProps<'/editor/[id]'>) {
  const { id } = use(params);
  const user = useCurrentUser();
  const { loaded, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 404 ? 'This file does not exist.' : `Failed to load (${res.status})`);
        const { meta, doc } = parseDoc<{ meta: ProjectMeta; doc: RiveDoc | null }>(await res.text());
        if (!doc) throw new Error('This file has no document data.');
        if (cancelled) return;
        setKnownUpdatedAt(meta.updatedAt);
        useEditor.getState().load(meta.id, meta.name, doc, !canEdit(user, meta));
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // reload when switching user so permissions are re-evaluated
  }, [id, user]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <div className="text-[#ffb4b4]">{error}</div>
        <Link href="/" className="btn">
          Back to files
        </Link>
      </div>
    );
  }
  if (!ready) return <div className="h-full flex items-center justify-center text-t2">Loading editor…</div>;
  return <Editor />;
}
