import { useTranslation } from '../../LangContext.js';
import styles from './Legal.module.css';

export default function LegalNotice({ onBack }) {
  const { t } = useTranslation();

  return (
    <main className={styles.container}>
      <div className={styles.topBar}>
        <h1 className={styles.header}>
          {t.appTitle} &mdash; {t.privacyTitle}
        </h1>
        <button
          className={styles.backBtn}
          onClick={onBack}
        >
          &larr; {t.backToApp}
        </button>
      </div>

      <p className={styles.intro}>{t.privacyIntro}</p>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyWhoTitle}</h2>
        <p>{t.privacyWhoText}</p>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyWhatTitle}</h2>
        <p>{t.privacyWhatText}</p>
        <ul className={styles.list}>
          <li>{t.privacyWhat1}</li>
          <li>{t.privacyWhat2}</li>
          <li>{t.privacyWhat3}</li>
        </ul>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyNoCookiesTitle}</h2>
        <p>{t.privacyNoCookiesText}</p>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyThirdTitle}</h2>
        <p>{t.privacyThirdText}</p>
        <ul className={styles.list}>
          <li>{t.privacyThird1}</li>
          <li>{t.privacyThird2}</li>
          <li>{t.privacyThird3}</li>
        </ul>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyRetentionTitle}</h2>
        <p>{t.privacyRetentionText}</p>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>{t.privacyRightsTitle}</h2>
        <p>{t.privacyRightsText}</p>
      </section>

      <footer className={styles.footer}>
        {t.privacyLastUpdated} 2026-07-28
      </footer>
    </main>
  );
}
