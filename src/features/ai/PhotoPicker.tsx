import { useEffect, useMemo, useState } from 'react';
import { ru } from '../../i18n/ru';
import { BottomSheet } from '../../ui/BottomSheet';
import { IconClose } from '../../ui/icons';
import { Button } from '../../ui/kit';
import { PhotoSource } from '../../ui/PhotoSource';
import styles from './PhotoPicker.module.css';

const t = ru.ai.photo;

/**
 * Selects up to `max` image files and shows thumbnails: a tap opens the photo, the small cross
 * in its corner removes it.
 */
export function PhotoPicker({
  files,
  onChange,
  max,
  label,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  max: number;
  label: string;
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [open, setOpen] = useState<number | null>(null);
  const remove = (i: number) => {
    onChange(files.filter((_, j) => j !== i));
    setOpen(null);
  };
  const shown = open !== null && open < urls.length ? open : null;
  return (
    <div className={styles.wrap}>
      {files.length > 0 && (
        <ul className={styles.grid}>
          {urls.map((u, i) => (
            <li key={u} className={styles.item}>
              <button
                type="button"
                className={styles.thumb}
                aria-label={`${t.open} ${i + 1}`}
                onClick={() => setOpen(i)}
              >
                <img src={u} alt="" />
              </button>
              <button
                type="button"
                className={styles.remove}
                aria-label={`${t.remove} ${i + 1}`}
                onClick={() => remove(i)}
              >
                <IconClose width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <PhotoSource
          label={label}
          multiple={max > 1}
          testId="photo-input"
          onFiles={(picked) => onChange([...files, ...picked].slice(0, max))}
        />
      )}
      <BottomSheet
        open={shown !== null}
        title={shown !== null ? t.viewTitle(shown + 1, urls.length) : ''}
        onClose={() => setOpen(null)}
      >
        {shown !== null && (
          <>
            <img src={urls[shown]} alt="" className={styles.full} />
            <Button block variant="danger" onClick={() => remove(shown)}>
              {t.remove}
            </Button>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
