import { GEOLOCATION_STATES } from '../../hooks/useGeolocation.js';
import { useTranslation } from '../../LangContext.js';
import styles from './LocationGate.module.css';

function GdprNotice({ onShowPrivacy }) {
  const { t } = useTranslation();
  return (
    <p className={styles.gdprNotice}>
      {t.gdprNotice}
      {' '}
      <button
        className={styles.gdprLink}
        onClick={(e) => { e.preventDefault(); onShowPrivacy(); }}
      >
        {t.gdprReadMore}
      </button>
    </p>
  );
}

export default function LocationGate({ state, permissionState, onRetry, onShowPrivacy }) {
  const { t } = useTranslation();

  return (
    <div className={styles.wrapper}>
      {state === GEOLOCATION_STATES.PENDING && (
        <>
          <p className={styles.text} role="status">
            {t.locating}
          </p>
          <GdprNotice onShowPrivacy={onShowPrivacy} />
        </>
      )}
      {state === GEOLOCATION_STATES.DENIED && (
        <div className={styles.block} role="alert">
          <p className={styles.text}>{t.locationRequired}</p>
          <p className={styles.hint}>{t.locationHint}</p>
          {permissionState !== 'denied' && (
            <button className={styles.button} onClick={onRetry}>
              {t.tryAgain}
            </button>
          )}
          <GdprNotice onShowPrivacy={onShowPrivacy} />
        </div>
      )}
      {state === GEOLOCATION_STATES.UNAVAILABLE && (
        <div className={styles.block} role="alert">
          <p className={styles.text}>{t.locationUnavailable}</p>
          <button className={styles.button} onClick={onRetry}>
            {t.tryAgain}
          </button>
          <GdprNotice onShowPrivacy={onShowPrivacy} />
        </div>
      )}
    </div>
  );
}
