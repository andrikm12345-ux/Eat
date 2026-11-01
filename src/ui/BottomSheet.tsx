import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ru } from '../i18n/ru';
import { IconClose } from './icons';
import { motionEnabled } from './motion';
import styles from './BottomSheet.module.css';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ open, title, onClose, children }: Props) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  // Stay on screen for a moment after closing so the sheet can slide away.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  if (!open && shown && !motionEnabled()) setShown(false);
  useEffect(() => {
    if (open || !shown) return;
    const id = setTimeout(() => setShown(false), 220);
    return () => clearTimeout(id);
  }, [open, shown]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!shown) return null;
  const closing = !open;

  return (
    <div
      className={`${styles.backdrop} ${closing ? styles.closing : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !closing) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.grabber} aria-hidden="true" />
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={ru.add.close}
          >
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
