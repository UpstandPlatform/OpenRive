'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileImage, Image as ImageIcon, Plus, Trash2, Type, Upload, Music, File as FileIcon } from 'lucide-react';
import { CoreObj } from '@/lib/rive/document';
import { addFontAsset, addImageAsset, assetBytes, assetKind, assetUsers, fileAssets, guessMime, imageSizes, placeImage, removeAsset } from '@/lib/rive/assets';
import { findArtboard } from '@/lib/rive/ops';
import { registerImageSizes } from '@/lib/rive/scene';
import { importSvg } from '@/lib/rive/svg';
import { useEditor } from '@/lib/store/editor';
import { openContextMenu, sep } from './ContextMenu';
import { toast } from '@/lib/client/toast';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,.ttf,.otf';

/** Center of the active artboard in its own (origin-relative) coordinates. */
function artboardCenter() {
  const st = useEditor.getState();
  const ab = st.doc && findArtboard(st.doc, st.activeArtboardId);
  if (!ab) return null;
  const w = Number(ab.artboard.props.width ?? 500);
  const h = Number(ab.artboard.props.height ?? 500);
  const ox = Number(ab.artboard.props.originX ?? 0);
  const oy = Number(ab.artboard.props.originY ?? 0);
  return { ab, x: w * (0.5 - ox), y: h * (0.5 - oy), max: Math.min(w, h) * 0.8 };
}

/** Imports dropped/picked files as assets. Images and SVGs are also placed on the artboard when `place` is set. */
export async function importAssetFiles(files: File[], place = true) {
  const st = useEditor.getState();
  if (!st.doc || st.readOnly) return;
  for (const file of files) {
    const lower = file.name.toLowerCase();
    const base = file.name.replace(/\.[^.]+$/, '');
    try {
      if (lower.endsWith('.svg')) {
        const text = await file.text();
        let group: CoreObj | null = null;
        st.commit((d) => {
          const c = artboardCenter();
          const ab = c && findArtboard(d, c.ab.id);
          if (!c || !ab) return;
          group = importSvg(text, { artboard: ab, x: c.x, y: c.y, width: Math.min(c.max, 300), name: base }).group;
        });
        if (group) st.select([(group as CoreObj).id]);
        toast(`Imported ${file.name} as vector shapes`);
      } else if (/\.(ttf|otf)$/.test(lower)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        st.commit((d) => void addFontAsset(d, base, bytes));
        toast(`Added font ${base}`);
      } else if (/\.(png|jpe?g|webp)$/.test(lower)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const bmp = await createImageBitmap(new Blob([bytes], { type: guessMime(lower) }));
        const { width, height } = bmp;
        bmp.close();
        let placed: string | null = null;
        st.commit((d) => {
          const asset = addImageAsset(d, base, bytes, width, height);
          registerImageSizes(imageSizes(d));
          const c = artboardCenter();
          const ab = c && findArtboard(d, c.ab.id);
          if (place && c && ab) placed = placeImage(ab, asset, c.x, c.y, undefined, c.max).id;
        });
        if (placed) st.select([placed]);
        toast(`Imported ${file.name} (${width}×${height})`);
      } else {
        toast(`Unsupported file type: ${file.name}`);
      }
    } catch (e) {
      toast(`Could not import ${file.name}: ${(e as Error).message}`);
    }
  }
}

/** Places an image asset at the center of the active artboard and selects it. */
export function placeAssetOnArtboard(assetId: string) {
  const st = useEditor.getState();
  if (st.readOnly) return;
  let id: string | null = null;
  st.commit((d) => {
    registerImageSizes(imageSizes(d));
    const c = artboardCenter();
    const ab = c && findArtboard(d, c.ab.id);
    const a = d.top.find((o) => o.id === assetId);
    if (c && ab && a?.type === 'ImageAsset') id = placeImage(ab, a, c.x, c.y, undefined, c.max).id;
  });
  if (id) st.select([id]);
}

function useObjectUrl(asset: CoreObj) {
  const bytes = assetBytes(asset);
  const url = useMemo(
    () => (bytes && asset.type === 'ImageAsset' ? URL.createObjectURL(new Blob([bytes.slice()], { type: guessMime(String(asset.props.name ?? '')) })) : null),
    [bytes, asset.type, asset.props.name],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

function Thumb({ asset }: { asset: CoreObj }) {
  const url = useObjectUrl(asset);
  const kind = assetKind(asset);
  return (
    <div className="w-9 h-9 rounded bg-bg3 checker flex items-center justify-center overflow-hidden shrink-0">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
      ) : kind === 'font' ? (
        <Type size={15} className="text-t2" />
      ) : kind === 'audio' ? (
        <Music size={15} className="text-t2" />
      ) : kind === 'image' ? (
        <ImageIcon size={15} className="text-t2" />
      ) : (
        <FileIcon size={15} className="text-t2" />
      )}
    </div>
  );
}

export function AssetsPanel() {
  const doc = useEditor((s) => s.doc);
  const readOnly = useEditor((s) => s.readOnly);
  const input = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const s = useEditor.getState();
  const assets = useMemo(() => (doc ? fileAssets(doc) : []), [doc]);
  if (!doc) return null;

  const place = (asset: CoreObj) => placeAssetOnArtboard(asset.id);

  const remove = (asset: CoreObj) => {
    const users = assetUsers(doc, asset.id);
    if (users.length && !confirm(`"${asset.props.name}" is used by ${users.length} object(s). Delete it and remove the images using it?`)) return;
    let ok = true;
    s.commit((d) => {
      ok = removeAsset(d, asset.id);
    });
    if (!ok) toast('This font is used by text objects; change their font first.');
  };

  const menu = (e: React.MouseEvent, asset: CoreObj) => {
    const kind = assetKind(asset);
    openContextMenu(e, [
      ...(kind === 'image' ? [{ label: 'Place on artboard', icon: <Plus size={13} />, run: () => place(asset), disabled: readOnly }] : []),
      { label: 'Rename', run: () => setRenaming(asset.id), disabled: readOnly },
      ...(assetBytes(asset)
        ? [
            {
              label: 'Download',
              run: () => {
                const a = document.createElement('a');
                const ext = kind === 'font' ? '.ttf' : '';
                a.href = URL.createObjectURL(new Blob([assetBytes(asset)!.slice()]));
                a.download = `${asset.props.name || 'asset'}${ext}`;
                a.click();
              },
            },
          ]
        : []),
      sep,
      { label: 'Delete', icon: <Trash2 size={13} />, danger: true, run: () => remove(asset), disabled: readOnly },
    ]);
  };

  const groups: [string, CoreObj[]][] = [
    ['Images', assets.filter((a) => assetKind(a) === 'image')],
    ['Fonts', assets.filter((a) => assetKind(a) === 'font')],
    ['Other', assets.filter((a) => assetKind(a) === 'audio' || assetKind(a) === 'other')],
  ];

  return (
    <div
      className={`flex-1 overflow-auto flex flex-col ${dragOver ? 'outline outline-2 outline-accent -outline-offset-2' : ''}`}
      onDragOver={(e) => {
        if (readOnly || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        importAssetFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="section flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <FileImage size={13} className="text-t2" />
          <span className="panel-title flex-1">Assets</span>
          <button className="icon-btn" disabled={readOnly} title="Import images, SVGs or fonts" onClick={() => input.current?.click()}>
            <Upload size={13} />
          </button>
        </div>
        <p className="text-t3 text-[11px] leading-snug">
          Import PNG, JPG or WebP images (embedded in the .riv), SVGs (converted to editable vector shapes) or TTF/OTF fonts. You can also drop files here or onto
          the canvas.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            importAssetFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button className="btn h-7 justify-center" disabled={readOnly} onClick={() => input.current?.click()}>
          <Plus size={13} /> Import asset
        </button>
      </div>
      {groups.map(([title, list]) =>
        list.length ? (
          <div key={title} className="section flex flex-col gap-1">
            <div className="label mb-1">
              {title} · {list.length}
            </div>
            {list.map((a) => {
              const users = assetUsers(doc, a.id).length;
              const embedded = !!assetBytes(a);
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-2 p-1 rounded hover:bg-bg3 group"
                  onContextMenu={(e) => menu(e, a)}
                  onDoubleClick={() => assetKind(a) === 'image' && !readOnly && place(a)}
                  title={assetKind(a) === 'image' ? 'Double-click to place on the artboard' : undefined}
                  draggable={assetKind(a) === 'image'}
                  onDragStart={(e) => e.dataTransfer.setData('application/x-openrive-asset', a.id)}
                >
                  <Thumb asset={a} />
                  <div className="flex-1 min-w-0">
                    {renaming === a.id ? (
                      <input
                        autoFocus
                        className="field h-6 w-full"
                        defaultValue={String(a.props.name ?? '')}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) s.commit((d) => void (d.top.find((o) => o.id === a.id)!.props.name = v));
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <div className="truncate" onDoubleClick={(e) => (e.stopPropagation(), !readOnly && setRenaming(a.id))}>
                        {String(a.props.name || 'Untitled')}
                      </div>
                    )}
                    <div className="text-t3 text-[10px] truncate">
                      {assetKind(a) === 'image' && `${a.props.width ?? '?'}×${a.props.height ?? '?'} · `}
                      {embedded ? `${Math.max(1, Math.round(assetBytes(a)!.length / 1024))} KB` : 'referenced (not embedded)'}
                      {users ? ` · used ${users}×` : ''}
                    </div>
                  </div>
                  {assetKind(a) === 'image' && (
                    <button className="icon-btn opacity-0 group-hover:opacity-100" disabled={readOnly} title="Place on artboard" onClick={() => place(a)}>
                      <Plus size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null,
      )}
      {!assets.length && <div className="p-4 text-t3 text-center text-[12px]">No assets yet.</div>}
    </div>
  );
}
