import type { ReactNode } from 'react';
import { ru } from '../i18n/ru';
import styles from './Page.module.css';

export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        {title}
      </h1>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      {text}
      <span className={styles.note}>{ru.common.stageNote}</span>
    </div>
  );
}
