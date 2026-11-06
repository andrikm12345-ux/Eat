import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { repos } from '../../db/repos';
import { toLocalDate } from '../../domain/dates';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { loadStreaks } from '../../services/gamification';
import { IconChevron } from '../../ui/icons';
import { Page } from '../../ui/Page';
import sky from '../../ui/sky/sky.module.css';
import { MORE_GROUPS } from './menu';
import styles from './MorePage.module.css';

const h = ru.more.hero;

export default function MorePage() {
  return (
    <Page title={ru.more.title} hero={<MoreHero />}>
      {MORE_GROUPS.map((g) => (
        <section key={g.title} className={styles.group}>
          <h2 className={styles.groupTitle}>{g.title}</h2>
          <ul className={styles.grid}>
            {g.items.map(({ key, to, Icon, tone }) => (
              <li key={key}>
                <Link to={to} className={`${styles.tile} ${styles[tone]}`}>
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

/** On the sky: who is signed in and how the streaks are going. */
function MoreHero() {
  const today = toLocalDate(new Date());
  const login = useLiveQuery(() => repos.settings.get<string>(ACCOUNT.login, ''), []);
  const streaks = useLiveQuery(() => loadStreaks(repos, today), [today]);
  const name = login ? login.charAt(0).toUpperCase() + login.slice(1) : '';
  return (
    <div className={styles.hero}>
      {name && (
        <div className={styles.who}>
          <span className={styles.avatar} aria-hidden="true">
            {name.charAt(0)}
          </span>
          <strong>{name}</strong>
        </div>
      )}
      {streaks && (
        <div className={styles.chips}>
          {streaks.log.current > 0 ? (
            <Link to="/more/achievements" className={styles.chip}>
              {h.streak(streaks.log.current)}
            </Link>
          ) : (
            <p className={sky.sub}>{h.start}</p>
          )}
          {streaks.weigh.current > 0 && (
            <Link to="/more/achievements" className={styles.chip}>
              {h.weigh(streaks.weigh.current)}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
