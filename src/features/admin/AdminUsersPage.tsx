import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { loadAdminUsers, removeTestUsers, type AdminUser } from '../../services/adminView';
import { BackBar } from '../../ui/BackBar';
import { IconChevron } from '../../ui/icons';
import { Button, Notice } from '../../ui/kit';
import { toast } from '../../state/ui';
import { Loading } from '../../ui/states';
import styles from './admin.module.css';
import wizard from '../onboarding/Wizard.module.css';
import { useGoBack } from '../../ui/useGoBack';
import { useSwipeBack } from '../../ui/useSwipeBack';

const t = ru.admin;
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('ru-RU') : t.never);

export default function AdminUsersPage() {
  useSwipeBack(true, useGoBack());
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    loadAdminUsers(repos).then((r) => {
      if (r.ok) setUsers(r.data);
      else setError(r.reason === 'forbidden' ? t.forbidden : t.loadError);
    });

  useEffect(() => {
    void reload();
  }, []);

  const cleanTests = async () => {
    if (!window.confirm(t.cleanConfirm)) return;
    const n = await removeTestUsers(repos);
    toast({ text: n === null ? t.cleanFail : t.cleaned(n) });
    if (n !== null) await reload();
  };

  return (
    <div className={wizard.wrap}>
      <BackBar title={t.title} bleed />
      <h1 className={wizard.srTitle}>{t.title}</h1>
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
            {users.some((u) => u.login?.startsWith('claude-test-')) && (
              <Button variant="danger" block onClick={() => void cleanTests()}>
                {t.cleanTests}
              </Button>
            )}
            <p className={styles.muted}>{t.readOnly}</p>
          </>
        )}
      </div>
    </div>
  );
}
