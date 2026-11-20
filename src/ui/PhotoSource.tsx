import type { Ref } from 'react';
import { ru } from '../i18n/ru';
import { IconCamera, IconImage } from './icons';
import styles from './PhotoSource.module.css';

const t = ru.photoSource;

/**
 * Two ways to add a photo: the camera and the gallery. One file field shows only the gallery
 * on newer Android phones (the system photo picker has no camera), so the camera has its own
 * button with `capture`, which opens it directly on Android and iPhone.
 */
export function PhotoSource({
  onFiles,
  multiple = false,
  disabled = false,
  busy,
  label,
  testId,
  galleryRef,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** Shown instead of the buttons while the photo is being read. */
  busy?: string | null;
  /** What the photo is for (read out by screen readers, shown above the buttons). */
  label?: string;
  /** Test id of the gallery field (the camera one gets "-camera"). */
  testId?: string;
  galleryRef?: Ref<HTMLInputElement>;
}) {
  const pick = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) onFiles(files);
  };
  return (
    <div className={styles.wrap} role="group" aria-label={label}>
      {label && <span className={styles.label}>{label}</span>}
      {busy ? (
        <span className={styles.busy} role="status">
          {busy}
        </span>
      ) : (
        <div className={styles.row}>
          <label className={`${styles.btn} ${disabled ? styles.off : ''}`}>
            <IconCamera width={20} height={20} />
            <span>{t.camera}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={disabled}
              data-testid={testId ? `${testId}-camera` : undefined}
              onChange={(e) => pick(e.currentTarget)}
            />
          </label>
          <label className={`${styles.btn} ${disabled ? styles.off : ''}`}>
            <IconImage width={20} height={20} />
            <span>{t.gallery}</span>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple={multiple}
              disabled={disabled}
              data-testid={testId}
              onChange={(e) => pick(e.currentTarget)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
