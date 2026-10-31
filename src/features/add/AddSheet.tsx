import { ru } from '../../i18n/ru';
import { BottomSheet } from '../../ui/BottomSheet';
import { ADD_TILES } from './addTiles';
import styles from './AddSheet.module.css';

type Props = { open: boolean; onClose: () => void };

export function AddSheet({ open, onClose }: Props) {
  return (
    <BottomSheet open={open} title={ru.add.title} onClose={onClose}>
      <div className={styles.grid}>
        {ADD_TILES.map((key) => (
          // Tiles become functional in later stages.
          <button key={key} type="button" className={styles.tile} disabled>
            <span>{ru.add.tiles[key]}</span>
            <span className={styles.soon}>{ru.add.soon}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
