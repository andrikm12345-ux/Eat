import { Link } from 'react-router';
import { ru } from '../../i18n/ru';
import { Page } from '../../ui/Page';
import { MORE_MENU } from './menu';
import styles from './MorePage.module.css';

export default function MorePage() {
  return (
    <Page title={ru.more.title}>
      <ul className={styles.list}>
        {MORE_MENU.map(({ key, to }) => (
          <li key={key} className={styles.item}>
            {to ? (
              <Link to={to} className={styles.link}>
                <span>{ru.more.items[key]}</span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </Link>
            ) : (
              <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true">
                <span>{ru.more.items[key]}</span>
                <span>{ru.add.soon}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Page>
  );
}
