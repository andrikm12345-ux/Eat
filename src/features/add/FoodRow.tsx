import { Link } from 'react-router';
import { formatKcal } from '../../domain/format';
import { isKcalInconsistent } from '../../domain/nutrients';
import { formatRub, pricePer100g } from '../../domain/price';
import type { Food } from '../../domain/types';
import { ru } from '../../i18n/ru';
import { IconTrash } from '../../ui/icons';
import styles from './add.module.css';

const SOURCE: Record<Food['source'], string> = {
  base: ru.search.sourceBase,
  off: ru.search.sourceOff,
  user: ru.search.sourceUser,
  ai_label: ru.search.sourceAi,
};

/** "Пятёрочка · 18 ₽ / 100 г", or null when neither is known. */
function buyLine(food: Food): string | null {
  const per100 = pricePer100g(food.price, food.priceGrams);
  const parts = [food.store, per100 === null ? null : ru.search.pricePer100(formatRub(per100))];
  const line = parts.filter(Boolean).join(' · ');
  return line || null;
}

export function FoodRow({
  food,
  to,
  onPick,
  onDelete,
}: {
  food: Food;
  to?: string;
  onPick?: (f: Food) => void;
  /** Shows a delete button next to the row. */
  onDelete?: (f: Food) => void;
}) {
  const body = (
    <>
      <span className={styles.rowMain}>
        <span className={`${styles.rowName} ${styles.rowNameWrap}`}>
          {food.name}
          {food.brand ? ` · ${food.brand}` : ''}
        </span>
        <span className={styles.rowSub}>
          {ru.search.per100(formatKcal(food.per100g.kcal))}
          <span className={styles.badge}>{SOURCE[food.source]}</span>
          {isKcalInconsistent(food.per100g) && (
            <span className={styles.badge} title={ru.search.inconsistent}>
              !
            </span>
          )}
        </span>
        {buyLine(food) && <span className={styles.rowSub}>{buyLine(food)}</span>}
      </span>
      {food.lastGrams ? <span className={styles.rowRight}>{food.lastGrams} г</span> : null}
    </>
  );
  return (
    <li className={`${styles.row} ${onDelete ? styles.rowWithAction : ''}`}>
      {onPick ? (
        <button type="button" className={styles.rowLink} onClick={() => onPick(food)}>
          {body}
        </button>
      ) : (
        <Link className={styles.rowLink} to={to ?? '#'}>
          {body}
        </Link>
      )}
      {onDelete && (
        <button
          type="button"
          className={styles.rowDelete}
          aria-label={`${ru.common.delete}: ${food.name}`}
          onClick={() => onDelete(food)}
        >
          <IconTrash />
        </button>
      )}
    </li>
  );
}
