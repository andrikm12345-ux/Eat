import { useEffect } from 'react';
import { toLocalDate } from '../domain/dates';
import { repos } from '../db/repos';
import { SETTINGS } from '../db/settingsKeys';
import { ru } from '../i18n/ru';

/**
 * Local notifications only while the app is open (no background delivery promised):
 * once a day after the weigh-in time, if there is no weigh-in yet today.
 */
export function useOpenNotifications() {
  useEffect(() => {
    if (!('Notification' in window)) return;
    const check = async () => {
      const on = await repos.settings.get(
        SETTINGS.notifyWhileOpen.key,
        SETTINGS.notifyWhileOpen.def,
      );
      if (!on || Notification.permission !== 'granted') return;
      const today = toLocalDate(new Date());
      const key = `notified:weigh:${today}`;
      const time = await repos.settings.get(SETTINGS.weighTime.key, SETTINGS.weighTime.def);
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm < time || (await repos.settings.get(key, false))) return;
      if ((await repos.weights.latest())?.date === today) return;
      await repos.settings.set(key, true);
      new Notification(ru.appName, {
        body: ru.reminders.notifyWeigh,
        icon: '/icons/icon-192.png',
        tag: 'weigh',
      });
    };
    void check();
    const id = window.setInterval(() => void check(), 60_000);
    return () => window.clearInterval(id);
  }, []);
}
