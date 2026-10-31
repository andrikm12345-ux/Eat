import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { repos } from '../../db/repos';
import { ru } from '../../i18n/ru';
import {
  ACCOUNT,
  createRecoveryCode,
  loginAccount,
  registerAccount,
  resetAccount,
  signOut,
  type AccountError,
} from '../../services/account';
import { syncNow } from '../../services/sync';
import { toast } from '../../state/ui';
import { Button, Card, Notice, Segmented, Switch, TextField } from '../../ui/kit';
import styles from '../onboarding/Wizard.module.css';

const t = ru.account;

export default function AccountPage() {
  const navigate = useNavigate();
  const session = useLiveQuery(async () => {
    const [login, token, last] = await Promise.all([
      repos.settings.get<string>(ACCOUNT.login, ''),
      repos.settings.get<string>(ACCOUNT.token, ''),
      repos.settings.get<string>(ACCOUNT.lastSync, ''),
    ]);
    return { login, signedIn: !!token, last };
  }, []);
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>(
    params.get('mode') === 'signUp' ? 'signUp' : 'signIn',
  );
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <div className={styles.wrap}>{ru.common.loading}</div>;

  const message = (e: AccountError) => t.errors[e];

  async function finish() {
    const s = await syncNow(repos);
    setBusy(false);
    if (!s.ok) toast({ text: t.syncErrors[s.reason] });
    navigate('/', { replace: true });
  }

  async function submit() {
    setError(null);
    if (mode === 'signUp' && password !== password2) return setError(t.errors.mismatch);
    setBusy(true);
    const r =
      mode === 'signUp'
        ? await registerAccount(repos, login, password)
        : mode === 'reset'
          ? await resetAccount(repos, login, code, password)
          : await loginAccount(repos, login, password);
    if ('error' in r) {
      setBusy(false);
      return setError(message(r.error));
    }
    // New accounts and resets show the recovery code once before going on.
    if (r.recoveryCode) {
      setBusy(false);
      return setNewCode(r.recoveryCode);
    }
    await finish();
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
        {newCode ? (
          <>
            <Notice tone="info">{t.saveCodeText}</Notice>
            <Card title={t.saveCodeTitle}>
              <p
                style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, wordBreak: 'break-all' }}
              >
                {newCode}
              </p>
              <Button
                block
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(newCode);
                  toast({ text: t.copied });
                }}
              >
                {t.copy}
              </Button>
            </Card>
            <Button
              block
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void finish();
              }}
            >
              {t.saved}
            </Button>
          </>
        ) : session.signedIn ? (
          <>
            <Card>
              <p>{t.signedIn(session.login)}</p>
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
            <Card title={t.newCodeTitle}>
              <p>{t.newCodeHint}</p>
              <TextField
                label={t.password}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
              <Switch label={t.showPassword} checked={show} onChange={setShow} />
              <Button
                block
                variant="secondary"
                disabled={busy || !password}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const r = await createRecoveryCode(repos, password);
                  setBusy(false);
                  if ('error' in r) return setError(message(r.error));
                  setPassword('');
                  setNewCode(r.recoveryCode);
                }}
              >
                {t.newCodeGo}
              </Button>
            </Card>
            <Button block variant="secondary" onClick={() => void signOut(repos)}>
              {t.signOut}
            </Button>
          </>
        ) : (
          <>
            <Notice tone="info">{mode === 'reset' ? t.resetHint : t.intro}</Notice>
            {mode !== 'reset' && (
              <Segmented
                label={t.title}
                value={mode}
                onChange={(v: 'signIn' | 'signUp') => {
                  setMode(v);
                  setError(null);
                }}
                options={[
                  { value: 'signIn', label: t.tabs.signIn },
                  { value: 'signUp', label: t.tabs.signUp },
                ]}
              />
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <TextField
                label={t.login}
                hint={mode === 'signUp' ? t.loginHint : undefined}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={login}
                onChange={setLogin}
              />
              {mode === 'reset' && (
                <TextField
                  label={t.recoveryCode}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={code}
                  onChange={setCode}
                />
              )}
              <TextField
                label={mode === 'reset' ? t.newPassword : t.password}
                hint={mode !== 'signIn' ? t.passwordHint : undefined}
                type={show ? 'text' : 'password'}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={setPassword}
              />
              {mode === 'signUp' && (
                <TextField
                  label={t.password2}
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password2}
                  onChange={setPassword2}
                />
              )}
              <Switch label={t.showPassword} checked={show} onChange={setShow} />
              {error && <Notice>{error}</Notice>}
              {mode === 'signUp' && <p>{t.noReset}</p>}
              <Button block type="submit" disabled={busy || !login || !password}>
                {busy
                  ? t.working
                  : mode === 'signUp'
                    ? t.signUp
                    : mode === 'reset'
                      ? t.resetGo
                      : t.signIn}
              </Button>
              {mode !== 'signUp' && (
                <p>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      setMode(mode === 'reset' ? 'signIn' : 'reset');
                      setError(null);
                    }}
                  >
                    {mode === 'reset' ? t.backToSignIn : t.forgot}
                  </button>
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
