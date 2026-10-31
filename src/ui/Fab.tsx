import { ru } from '../i18n/ru';
import { IconPlus } from './icons';
import styles from './Fab.module.css';

type Props = { onClick: () => void; expanded: boolean };

export function Fab({ onClick, expanded }: Props) {
  return (
    <button
      type="button"
      className={styles.fab}
      onClick={onClick}
      aria-label={ru.add.fab}
      aria-haspopup="dialog"
      aria-expanded={expanded}
    >
      <IconPlus width={28} height={28} />
    </button>
  );
}
