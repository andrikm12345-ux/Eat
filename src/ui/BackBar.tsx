import type { CSSProperties } from 'react';
import { SeasonLayer, Stars } from '../features/today/SeasonLayer';
import { ru } from '../i18n/ru';
import { IconBack } from './icons';
import { usePageTitleStore } from './pageTitle';
import { useGoBack } from './useGoBack';
import { useSky, useTopColor } from './sky/useSky';
import styles from './BackBar.module.css';

/**
 * The top of every inner screen: a strip of the same sky as on the tabs, a round back button
 * and the screen's title (falls back to "Сегодня" without history).
 */
export function BackBar({ title: own, bleed = false }: { title?: string; bleed?: boolean } = {}) {
  const goBack = useGoBack();
  const stored = usePageTitleStore((s) => s.title);
  const title = own ?? stored;
  const { sky, season } = useSky();
  useTopColor(sky.top);
  const style = {
    '--sky-top': sky.top,
    '--sky-mid': sky.mid,
    '--sky-bottom': sky.bottom,
    '--stars': String(sky.stars),
  } as CSSProperties;
  return (
    <div
      className={`${styles.bar} ${bleed ? styles.bleed : ''} ${sky.dark ? styles.dark : styles.light}`}
      style={style}
    >
      <Stars />
      <div className={styles.row}>
        <button type="button" className={styles.back} aria-label={ru.common.back} onClick={goBack}>
          <IconBack />
        </button>
        {/* The real heading is on the page itself; this is its picture on the sky. */}
        <span className={styles.title} aria-hidden="true">
          {title}
        </span>
        <span className={styles.spacer} />
      </div>
      <SeasonLayer season={season} ground />
    </div>
  );
}
