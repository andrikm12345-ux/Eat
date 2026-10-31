import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import {
  ACCOUNT,
  requestCode,
  signOut,
  verifyCode,
  type AccountError,
} from '../../services/account';
import { syncNow } from '../../services/sync';
import { toast } from '../../state/ui';
import { Button, Card, Notice, TextField } from '../../ui/kit';
import styles from '../onboarding/Wizard.module.css';

const t = ru.account;

export default function AccountPage() {
  const navigate = useNavigate();
  const session = useLiveQuery(async () => {
    const [email, token, last] = await Promise.all([
      repos.settings.get<string>(ACCOUNT.email, ''),
      repos.settings.get<string>(ACCOUNT.token, ''),
      repos.settings.get<string>(ACCOUNT.lastSync, ''),
    ]);
    return { email, signedIn: !!token, last };
  }, []);
  const [email, setEmail] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <div className={styles.wrap}>{ru.common.loading}</div>;

  const fail = (e: AccountError) => setError(t.errors[e]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await requestCode(email.trim());
    setBusy(false);
    if ('error' in r) return fail(r.error);
    setChallenge(r.challenge);
    setCode('');
  }

  async function signIn() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    const r = await verifyCode(repos, challenge, code);
    if ('error' in r) {
      setBusy(false);
      return fail(r.error);
    }
    const s = await syncNow(repos);
    setBusy(false);
    if (!s.ok) toast({ text: t.syncErrors[s.reason] });
    navigate('/', { replace: true });
  }

  async function sync() {
    setBusy(true);
    setError(null);
    const s = await syncNow(repos);
    setBusy(false);
    if (s.ok) toast({ text: t.synced });
    else setError(t.syncErrors[s.reason]);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.step}>
        <button type="button" className={styles.linkBtn} onClick={() => navigate(-1)}>
          ← {t.back}
        </button>
      </p>
      <h1 className={styles.title}>{t.title}</h1>
      <div className={styles.body}>
        {session.signedIn ? (
          <>
            <Card>
              <p>{t.signedIn(session.email)}</p>
              <p>
                {session.last
                  ? t.lastSync(new Date(session.last).toLocaleString('ru-RU'))
                  : t.neverSynced}
              </p>
              <p>{t.what}</p>
            </Card>
            {error && <Notice>{error}</Notice>}
            <Button block disabled={busy} onClick={() => void sync()}>
              {busy ? t.syncing : t.syncNow}
            </Button>
            <p>{t.signOutHint}</p>
            <Button
              block
              variant="secondary"
              onClick={async () => {
                await signOut(repos);
              }}
            >
              {t.signOut}
            </Button>
          </>
        ) : (
          <>
            <Notice tone="info">{t.intro}</Notice>
            {challenge === null ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <TextField
                  label={t.email}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={setEmail}
                />
                {error && <Notice>{error}</Notice>}
                <Button block type="submit" disabled={busy || !email.includes('@')}>
                  {busy ? t.sending : t.getCode}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void signIn();
                }}
              >
                <p>{t.sent(email.trim())}</p>
                <TextField
                  label={t.code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(v) => setCode(v.replace(/[^\d ]/g, ''))}
                  autoFocus
                />
                {error && <Notice>{error}</Notice>}
                <Button block type="submit" disabled={busy || code.replace(/\s/g, '').length < 8}>
                  {busy ? t.checking : t.signIn}
                </Button>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button variant="secondary" disabled={busy} onClick={() => void sendCode()}>
                    {t.resend}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setChallenge(null);
                      setError(null);
                    }}
                  >
                    {t.otherEmail}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
