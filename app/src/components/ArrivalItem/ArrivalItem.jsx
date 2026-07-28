import { memo } from 'react';
import { useTranslation } from '../../LangContext.js';
import styles from './ArrivalItem.module.css';

export default memo(function ArrivalItem({ arrival }) {
  const { t, display } = useTranslation();
  const urgent = arrival.minutes <= 3;

  return (
    <li className={`${styles.item} ${urgent ? styles.urgent : ''}`}>
      <div className={styles.left}>
        <span className={styles.lineId} aria-label={t.lineLabel(arrival.lineId)}>
          {arrival.lineId}
        </span>
        <div className={styles.names}>
          {display(arrival.lineName, arrival.lineNameEn) && (
            <span className={styles.lineName}>{display(arrival.lineName, arrival.lineNameEn)}</span>
          )}
          {display(arrival.direction, arrival.directionEn) && (
            <span className={styles.direction}>{display(arrival.direction, arrival.directionEn)}</span>
          )}
        </div>
      </div>
      <span
        className={styles.minutes}
        aria-label={t.inMinutes(arrival.minutes) + (urgent ? `, ${t.soon}` : '')}
      >
        {arrival.minutes}&prime;
      </span>
    </li>
  );
});
