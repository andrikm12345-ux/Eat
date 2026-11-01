import { Link } from 'react-router';
import { ru } from '../../i18n/ru';
import { IconChevron } from '../../ui/icons';
import { Page } from '../../ui/Page';
import { MORE_GROUPS } from './menu';
import styles from './MorePage.module.css';

export default function MorePage() {
  return (
    <Page title={ru.more.title}>
      {MORE_GROUPS.map((g) => (
        <section key={g.title} className={styles.group}>
          <h2 className={styles.groupTitle}>{g.title}</h2>
          <ul className={styles.list}>
            {g.items.map(({ key, to, Icon }) => (
              <li key={key} className={styles.item}>
                <Link to={to} className={styles.link}>
                  <span className={styles.icon}>
                    <Icon />
                  </span>
                  <span className={styles.label}>{ru.more.items[key]}</span>
                  <IconChevron className={styles.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
