import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ru } from '../i18n/ru';
import { MAIN_TABS } from './nav';
import styles from './Page.module.css';

export function Page({ title, children }: { title: string; children?: ReactNode }) {
  // Titles of the five tabs stay pinned (blurred) while the page scrolls.
  const pinned = MAIN_TABS.has(useLocation().pathname);
  return (
    <section
      className={`${styles.page} ${pinned ? styles.pinnedPage : ''} stagger`}
      aria-labelledby="page-title"
    >
      <header className={pinned ? styles.pinned : styles.head}>
        <h1 id="page-title" className={styles.title}>
          {title}
        </h1>
      </header>
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
