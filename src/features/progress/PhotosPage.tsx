import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { formatDateRu, toLocalDate } from '../../domain/dates';
import type { BlobRecord } from '../../domain/types';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { compressImage } from '../../services/images';
import { toast } from '../../state/ui';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/kit';
import { Page } from '../../ui/Page';
import { PhotoSource } from '../../ui/PhotoSource';
import styles from './progress.module.css';
import { EmptyState } from '../../ui/states';

const t = ru.photos;

function useObjectUrl(blob: Blob | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

function Thumb({ rec, onOpen }: { rec: BlobRecord; onOpen: () => void }) {
  const url = useObjectUrl(rec.blob);
  return (
    <button
      type="button"
      className={styles.photo}
      onClick={onOpen}
      aria-label={t.taken(formatDateRu(rec.date ?? ''))}
    >
      {url && <img src={url} alt="" />}
      <span className={styles.photoDate}>{formatDateRu(rec.date ?? '', 'd MMM yy')}</span>
    </button>
  );
}

export default function PhotosPage() {
  const photos = useLiveQuery(
    async () =>
      (await repos.blobs.list())
        .filter((b) => b.kind === 'progress')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [],
  );
  const [open, setOpen] = useState<BlobRecord | null>(null);
  const openUrl = useObjectUrl(open?.blob);

  async function add(files: File[]) {
    for (const file of files) {
      try {
        const blob = await compressImage(file, 1280, 0.82);
        await repos.blobs.create({
          blob,
          mime: 'image/jpeg',
          kind: 'progress',
          date: toLocalDate(new Date()),
        });
      } catch {
        toast({ text: t.failed });
      }
    }
  }

  return (
    <Page title={t.title}>
      <PhotoSource label={t.add} multiple onFiles={(f) => void add(f)} />
      {photos?.length === 0 && <EmptyState kind="photos" text={t.empty} />}
      <div className={styles.photos}>
        {photos?.map((p) => (
          <Thumb key={p.id} rec={p} onOpen={() => setOpen(p)} />
        ))}
      </div>
      <BottomSheet
        open={!!open}
        title={open ? t.taken(formatDateRu(open.date ?? '')) : ''}
        onClose={() => setOpen(null)}
      >
        {openUrl && <img src={openUrl} alt="" className={styles.full} />}
        {open && (
          <Button
            block
            variant="danger"
            onClick={async () => {
              const id = open.id;
              await repos.blobs.softDelete(id);
              setOpen(null);
              toast({
                text: t.deleted,
                action: { label: ru.common.undo, run: () => repos.blobs.restore(id) },
              });
            }}
          >
            {ru.common.delete}
          </Button>
        )}
      </BottomSheet>
    </Page>
  );
}
