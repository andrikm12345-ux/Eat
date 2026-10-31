import { NavLink } from 'react-router';
import { ru } from '../i18n/ru';
import { NAV_ITEMS } from './navItems';
import styles from './BottomNav.module.css';

export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label={ru.nav.label}>
      {NAV_ITEMS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
        >
          <span className={styles.icon}>
            <Icon />
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
