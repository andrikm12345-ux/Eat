import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadAdminUsers, type AdminUser } from '../../services/adminView';
import { BackBar } from '../../ui/BackBar';
import { IconChevron } from '../../ui/icons';
import { Notice } from '../../ui/kit';
import { Loading } from '../../ui/states';
import styles from './admin.module.css';
import wizard from '../onboarding/Wizard.module.css';

const t = ru.admin;
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('ru-RU') : t.never);

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadAdminUsers(repos).then((r) => {
      if (!alive) return;
      if (r.ok) setUsers(r.data);
      else setError(r.reason === 'forbidden' ? t.forbidden : t.loadError);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={wizard.wrap}>
      <BackBar />
      <h1 className={wizard.title}>{t.title}</h1>
      <div className={wizard.body}>
        {error && <Notice>{error}</Notice>}
        {!users && !error && <Loading />}
        {users && (
          <>
            <p>{t.total(users.length)}</p>
            <ul className={styles.list}>
              {users.map((u) => (
                <li key={u.id} className={styles.item}>
                  <Link to={`/admin/${u.id}`} className={styles.link}>
                    <span className={styles.grow}>
                      <span className={styles.name}>
                        {u.login ?? t.unknownLogin}
                        {u.me ? ` (${t.you})` : ''}
                      </span>
                      <span className={styles.sub}>{t.registered(when(u.createdAt))}</span>
                      <span className={styles.sub}>{t.lastLogin(when(u.lastLogin))}</span>
                      <span className={styles.sub}>{t.entriesCount(u.entries)}</span>
                    </span>
                    <IconChevron className={styles.chevron} />
                  </Link>
                </li>
              ))}
            </ul>
            <p className={styles.muted}>{t.readOnly}</p>
          </>
        )}
      </div>
    </div>
  );
}
