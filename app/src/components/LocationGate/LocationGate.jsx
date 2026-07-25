import { GEOLOCATION_STATES } from '../../hooks/useGeolocation.js';
import { useTranslation } from '../../i18n.jsx';
import styles from './LocationGate.module.css';

export default function LocationGate({ state, onRetry }) {
  const { t } = useTranslation();

  return (
    <div className={styles.wrapper}>
      {state === GEOLOCATION_STATES.PENDING && (
        <p className={styles.text} role="status">
          {t.locating}
        </p>
      )}
      {state === GEOLOCATION_STATES.DENIED && (
        <div className={styles.block} role="alert">
          <p className={styles.text}>{t.locationRequired}</p>
          <p className={styles.hint}>{t.locationHint}</p>
          <button className={styles.button} onClick={onRetry}>
            {t.tryAgain}
          </button>
        </div>
      )}
      {state === GEOLOCATION_STATES.UNAVAILABLE && (
        <div className={styles.block} role="alert">
          <p className={styles.text}>{t.locationUnavailable}</p>
          <button className={styles.button} onClick={onRetry}>
            {t.tryAgain}
          </button>
        </div>
      )}
    </div>
  );
}
