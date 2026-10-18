"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteImageAction, deleteTastingAction, deleteWineAction, mergeWinesAction } from "@/app/actions";
import { IMAGE_TYPES } from "@/lib/domain/wine";
import { prepareImage, uploadPhoto } from "@/components/capture/prepareImage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button, Notice, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { WineThumb } from "./display";
import s from "./detail.module.css";

type Img = { id: string; imageType: string };

export function Gallery({ wineId, images, wineType, title }: { wineId: string; images: Img[]; wineType: string; title: string }) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(images[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [imageType, setImageType] = useState("front_label");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = images.find((i) => i.id === active) ?? images[0];
  const typeLabel = (t: string) => IMAGE_TYPES.find((x) => x.value === t)?.label ?? "Photo";

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareImage(file);
      const id = await uploadPhoto(blob, { source: "user_upload", wineId, imageType });
      setAdding(false);
      setActive(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo couldn't be added.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={s.gallery}>
      <div className={s.galleryMain}>
        {current ? (
          <a href={`/api/images/${current.id}?size=original`} target="_blank" rel="noopener" aria-label={`Open full-size ${typeLabel(current.imageType).toLowerCase()} photo`}>
            <WineThumb imageId={current.id} wineType={wineType} alt={`${typeLabel(current.imageType)} of ${title}`} size="display" priority />
          </a>
        ) : (
          <WineThumb imageId={null} wineType={wineType} alt="" />
        )}
      </div>
      <div className={s.galleryThumbs}>
        {images.length > 1 &&
          images.map((img) => (
            <button key={img.id} type="button" className={s.galleryThumb} aria-pressed={img.id === current?.id} aria-label={`Show ${typeLabel(img.imageType)}`} onClick={() => setActive(img.id)}>
              <WineThumb imageId={img.id} wineType={wineType} alt="" />
            </button>
          ))}
        <Button size="small" icon="plus" onClick={() => setAdding(true)}>
          Add photo
        </Button>
        {current && (
          <Button size="small" variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)} aria-label="Delete this photo">
            Remove
          </Button>
        )}
      </div>
      <Sheet
        open={adding}
        onClose={() => !busy && setAdding(false)}
        title="Add a photo"
        footer={
          <Button variant="primary" icon="upload" onClick={() => fileRef.current?.click()} disabled={busy} aria-busy={busy}>
            {busy ? "Uploading…" : "Choose photo"}
          </Button>
        }
      >
        <label style={{ display: "grid", gap: "var(--space-1)" }}>
          <span className="eyebrow">This photo shows</span>
          <Select value={imageType} onChange={(e) => setImageType(e.target.value)}>
            {IMAGE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
        {error && <Notice tone="error">{error}</Notice>}
      </Sheet>
      {current && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Remove this photo?"
          confirmLabel="Remove photo"
          onConfirm={async () => {
            const r = await deleteImageAction(current.id);
            if (r.ok) {
              setConfirmDelete(false);
              setActive(images.find((i) => i.id !== current.id)?.id ?? null);
              router.refresh();
            }
            return r;
          }}
        >
          <p>The photo and its stored copies will be permanently deleted. Your tasting records are not affected.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export function DeleteWineButton({ wineId, title, tastings }: { wineId: string; title: string; tastings: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" size="small" icon="trash" onClick={() => setOpen(true)}>
        Delete wine
      </Button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} title={`Delete ${title}?`} confirmLabel="Delete permanently" requirePhrase="DELETE" onConfirm={() => deleteWineAction(wineId)}>
        <p>
          This permanently deletes the wine, <strong>{tastings === 1 ? "its tasting" : `all ${tastings} tastings`}</strong>, every observation and every photo. It can&rsquo;t be undone. Consider exporting it first.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function DeleteTastingButton({ tastingId, label }: { tastingId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="small" icon="trash" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this tasting?"
        confirmLabel="Delete tasting"
        onConfirm={async () => {
          const r = await deleteTastingAction(tastingId);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        <p>
          The tasting from <strong>{label}</strong> and its observations will be permanently deleted. The wine and its other tastings are kept.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function MergeDuplicate({ targetId, source }: { targetId: string; source: { id: string; label: string; tastings: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" icon="merge" onClick={() => setOpen(true)}>
        Merge into this record
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Merge duplicate records?"
        confirmLabel="Merge records"
        onConfirm={async () => {
          const r = await mergeWinesAction(targetId, source.id);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        <p>
          {source.tastings === 1 ? "The tasting" : `All ${source.tastings} tastings`} and photos from <strong>{source.label}</strong> will move to this record, unchanged. Grapes and identifiers
          it lists that this record lacks are added. Its other identity details are then removed; this page&rsquo;s are kept.
        </p>
      </ConfirmDialog>
    </>
  );
}
