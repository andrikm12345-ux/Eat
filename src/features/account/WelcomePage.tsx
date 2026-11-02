import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import { ACCOUNT } from '../../services/account';
import { LinkButton } from '../../ui/kit';
import styles from '../onboarding/Wizard.module.css';
import { Loading } from '../../ui/states';

const t = ru.welcome;

/** First screen for a new visitor: sign in or create an account. */
export default function WelcomePage() {
  const signedIn = useLiveQuery(
    async () => !!(await repos.settings.get<string>(ACCOUNT.token, '')),
    [],
  );
  if (signedIn === undefined)
    return (
      <div className={styles.wrap}>
        <Loading />
      </div>
    );
  if (signedIn) return <Navigate to="/" replace />;
  return (
    <div className={styles.wrap}>
      <div
        className={styles.body}
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        <h1 className={styles.title} style={{ fontSize: 'var(--fs-1)' }}>
          {t.title}
        </h1>
        <p className={styles.stepHint}>{t.tagline}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <LinkButton to="/account?mode=signUp" block>
          {t.signUp}
        </LinkButton>
        <LinkButton to="/account?mode=signIn" variant="secondary" block>
          {t.signIn}
        </LinkButton>
        <p className={styles.stepHint} style={{ textAlign: 'center' }}>
          {t.why}
        </p>
      </div>
    </div>
  );
}
