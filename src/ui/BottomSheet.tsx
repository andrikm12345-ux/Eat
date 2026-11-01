import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

  // Swipe down on the top part (grabber + title) to dismiss; the sheet follows the finger.
  const drag = useRef({ y: 0, active: false, last: 0, t: 0, v: 0 });
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, active: true, last: e.clientY, t: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - d.y);
    d.v = (e.clientY - d.last) / Math.max(1, e.timeStamp - d.t);
    d.last = e.clientY;
    d.t = e.timeStamp;
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const el = sheetRef.current;
    if (!el) return;
    const dy = e.clientY - d.y;
    el.style.transition = '';
    if (dy > 110 || d.v > 0.6) {
      el.style.transform = '';
      onClose();
    } else {
      el.style.transform = '';
    }
  };

  if (!shown) return null;
  const closing = !open;

  // Rendered straight into <body>: inside an animated page a fixed element would be sized
  // and positioned by its transformed ancestor instead of the screen.
  return createPortal(
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
        <div
          className={styles.dragZone}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className={styles.grabber} aria-hidden="true" />
        </div>
        <div
          className={styles.header}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
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
    </div>,
    document.body,
  );
}
