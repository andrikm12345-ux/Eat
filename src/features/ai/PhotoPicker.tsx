import { useEffect, useMemo } from 'react';
import { ru } from '../../i18n/ru';
import styles from '../add/add.module.css';

/** Selects up to `max` image files and shows thumbnails. */
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
  return (
    <div style={{ marginBottom: 'var(--sp-3)' }}>
      {files.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--sp-1)',
            marginBottom: 'var(--sp-2)',
          }}
        >
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              aria-label={`${ru.ai.photo.remove} ${i + 1}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              style={{
                padding: '0',
                border: 'none',
                borderRadius: 'var(--r-field)',
                overflow: 'hidden',
                aspectRatio: '1',
                background: 'var(--surface-2)',
              }}
            >
              <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      {files.length < max && (
        <label
          className={styles.input}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {label}
          <input
            type="file"
            accept="image/*"
            multiple={max > 1}
            hidden
            data-testid="photo-input"
            onChange={(e) =>
              onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, max))
            }
          />
        </label>
      )}
    </div>
  );
}
