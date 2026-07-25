import { useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n.jsx';
import styles from './StopCard.module.css';
import ArrivalItem from '../ArrivalItem/ArrivalItem.jsx';
import StatusMessage from '../StatusMessage/StatusMessage.jsx';
import { FETCH_STATES } from '../../hooks/useArrivals.js';

export default function StopCard({
  stop,
  isSelected,
  onSelect,
  arrivals,
  secondsAgo,
  arrivalsState,
}) {
  const { t, display, alternate } = useTranslation();
  const panelRef = useRef(null);

  useEffect(() => {
    if (isSelected && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [isSelected]);

  const altName = alternate(stop.name, stop.nameEn);

  return (
    <article className={`${styles.card} ${isSelected ? styles.selected : ''}`}>
      <button
        className={styles.trigger}
        onClick={() => onSelect(stop.code)}
        aria-expanded={isSelected}
        aria-label={t.stopLabel(display(stop.name, stop.nameEn), stop.distanceMeters)}
      >
        <div className={styles.badge}>
          <span className={styles.distance}>{stop.distanceMeters} {t.metersShort}</span>
        </div>
        <div className={styles.info}>
          <h2 className={styles.stopName}>{display(stop.name, stop.nameEn)}</h2>
          <p className={styles.stopDetails}>
            {display(stop.street, stop.streetEn) && `${display(stop.street, stop.streetEn)} · `}
            {altName && `${altName} · `}
            {stop.distanceMeters} {t.metersShort}
          </p>
        </div>
      </button>

      {isSelected && (
        <div className={styles.arrivals} tabIndex={-1} ref={panelRef}>
          {arrivalsState === FETCH_STATES.LOADING && (
            <StatusMessage type="status" message={t.loadingArrivals} />
          )}
          {arrivalsState === FETCH_STATES.ERROR && (
            <StatusMessage type="error" message={t.telematicsDownShort} />
          )}
          {arrivalsState === FETCH_STATES.READY && arrivals.length === 0 && (
            <StatusMessage type="status" message={t.noArrivals} />
          )}
          {arrivalsState === FETCH_STATES.READY && arrivals.length > 0 && (
            <>
              <ul className={styles.list} aria-label={t.arrivalsLabel}>
                {arrivals.map((a, i) => (
                  <ArrivalItem key={`${a.lineId}-${a.vehicleCode}-${i}`} arrival={a} />
                ))}
              </ul>
              <p className={styles.staleIndicator} aria-live="polite">
                {t.secondsAgo(secondsAgo)}
              </p>
            </>
          )}
        </div>
      )}
    </article>
  );
}
