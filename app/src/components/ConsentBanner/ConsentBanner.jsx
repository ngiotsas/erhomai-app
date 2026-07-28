import { useState, useEffect } from 'react';
import { useTranslation } from '../../LangContext.js';
import styles from './ConsentBanner.module.css';

const CONSENT_KEY = 'erhomai-consent';

function hasConsent() {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { /* storage unavailable */ return false; }
}

function loadUserWay() {
  if (document.getElementById('userway-script')) return;
  const s = document.createElement('script');
  s.id = 'userway-script';
  s.src = 'https://cdn.userway.org/widget.js';
  s.dataset.account = 'wCE0WdxbjC';
  s.defer = true;
  document.body.appendChild(s);
}

export default function ConsentBanner({ onShowPrivacy }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => !hasConsent());

  useEffect(() => {
    if (hasConsent()) {
      loadUserWay();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
    }
  }, []);

  function accept() {
    try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* storage unavailable */ }
    setVisible(false);
    loadUserWay();
  }

  if (!visible) return null;

  return (
    <aside className={styles.banner} role="dialog" aria-label="Cookie consent">
      <p className={styles.text}>{t.consentBannerText}</p>
      <div className={styles.actions}>
        <button className={styles.acceptBtn} onClick={accept}>
          {t.consentBannerAccept}
        </button>
        <button className={styles.moreBtn} onClick={onShowPrivacy}>
          {t.consentBannerMore}
        </button>
      </div>
    </aside>
  );
}
