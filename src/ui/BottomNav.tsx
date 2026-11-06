import type { CSSProperties, ReactNode } from 'react';
import { NavLink } from 'react-router';
import { ru } from '../i18n/ru';
import { NAV_ITEMS } from './navItems';
import { useSky } from './sky/useSky';
import styles from './BottomNav.module.css';

/**
 * The floating bar at the bottom, coloured like the sky of this hour. The round "+" floats
 * exactly in the middle of the screen, just above the bar, so the five tabs keep equal room.
 */
export function BottomNav({ fab }: { fab?: ReactNode }) {
  const { sky } = useSky();
  const style = {
    '--nav-a': sky.top,
    '--nav-b': sky.mid,
    '--nav-c': sky.bottom,
  } as CSSProperties;
  const link = (item: (typeof NAV_ITEMS)[number]) => {
    const { to, label, Icon, end } = item;
    return (
      <NavLink
        key={to}
        to={to}
        end={end}
        className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
      >
        <span className={styles.icon}>
          <Icon />
        </span>
        <span className={styles.label}>{label}</span>
      </NavLink>
    );
  };
  return (
    <nav
      className={`${styles.nav} ${sky.dark ? styles.dark : styles.light}`}
      style={style}
      aria-label={ru.nav.label}
    >
      {NAV_ITEMS.map(link)}
      {fab && <div className={styles.fabSlot}>{fab}</div>}
    </nav>
  );
}
