import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { MAIN_TABS } from './nav';
import { SkyHeader } from './sky/SkyHeader';
import skyStyles from './sky/sky.module.css';
import styles from './Page.module.css';

/**
 * A screen with a title. The five main tabs open with the sky (title on it, plus whatever the
 * tab puts in `hero`); other screens keep a plain title under the back bar.
 */
export function Page({
  title,
  hero,
  children,
}: {
  title: string;
  hero?: ReactNode;
  children?: ReactNode;
}) {
  const main = MAIN_TABS.has(useLocation().pathname);
  return (
    <section
      className={`${styles.page} ${main ? styles.skyPage : ''} stagger`}
      aria-labelledby="page-title"
    >
      {main ? (
        <SkyHeader labelledBy="page-title">
          <h1 id="page-title" className={skyStyles.title}>
            {title}
          </h1>
          {hero}
        </SkyHeader>
      ) : (
        <header className={styles.head}>
          <h1 id="page-title" className={styles.title}>
            {title}
          </h1>
        </header>
      )}
      {children}
    </section>
  );
}
