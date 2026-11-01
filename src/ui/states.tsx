import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link } from 'react-router';
import { ru } from '../i18n/ru';
import {
  IconBook,
  IconCalendar,
  IconCamera,
  IconCopy,
  IconPulse,
  IconReports,
  IconTag,
  IconTrophy,
} from './icons';
import styles from './states.module.css';

/** Shimmering placeholders of cards, shown instead of an empty screen while data loads. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const heights = [96, 160, 120, 96, 120];
  return (
    <div className={styles.loading} role="status" aria-label={ru.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: heights[i % heights.length] }} />
      ))}
    </div>
  );
}

export type EmptyKind =
  'workouts' | 'photos' | 'recipes' | 'templates' | 'foods' | 'diary' | 'reports' | 'achievements';

const ICONS: Record<EmptyKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  workouts: IconPulse,
  photos: IconCamera,
  recipes: IconBook,
  templates: IconCopy,
  foods: IconTag,
  diary: IconCalendar,
  reports: IconReports,
  achievements: IconTrophy,
};

/** A small illustration in the brand colours: soft blobs, a dashed ring and the kind's icon. */
function Art({ kind }: { kind: EmptyKind }) {
  const Icon = ICONS[kind];
  return (
    <div className={styles.art} aria-hidden="true">
      <svg viewBox="0 0 160 120" className={styles.bg}>
        <ellipse cx="80" cy="62" rx="68" ry="50" className={styles.blob} />
        <circle cx="80" cy="60" r="38" className={styles.ring} />
        <circle cx="26" cy="30" r="5" className={styles.dot} />
        <circle cx="140" cy="88" r="7" className={styles.dotSoft} />
        <path d="M132 22v10M127 27h10" className={styles.spark} />
        <path d="M22 92v8M18 96h8" className={styles.spark} />
      </svg>
      <span className={styles.badge}>
        <Icon />
      </span>
    </div>
  );
}

/** Empty list: a picture, one line of explanation and the action that fills it. */
export function EmptyState({
  kind,
  text,
  action,
}: {
  kind: EmptyKind;
  text: ReactNode;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div className={styles.empty}>
      <Art kind={kind} />
      <p className={styles.text}>{text}</p>
      {action &&
        (action.to ? (
          <Link to={action.to} className={styles.action}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className={styles.action} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
