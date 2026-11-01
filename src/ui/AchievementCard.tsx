import { ru } from '../i18n/ru';
import { useCelebrate } from '../state/celebrate';
import { IconTrophy } from './icons';
import styles from './AchievementCard.module.css';

/** A card that pops up in the middle of the screen when an achievement is earned. */
export function AchievementCard() {
  const card = useCelebrate((s) => s.card);
  const hide = useCelebrate((s) => s.hideCard);
  if (!card) return null;
  return (
    <div className={styles.layer}>
      <div
        key={card.id}
        className={styles.card}
        role="status"
        data-press
        onClick={() => hide(card.id)}
      >
        <span className={styles.badge} aria-hidden="true">
          <IconTrophy />
        </span>
        <span className={styles.kicker}>{ru.achievements.cardKicker}</span>
        <span className={styles.text}>{card.text}</span>
      </div>
    </div>
  );
}
