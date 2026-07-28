import { useTranslation } from '../../i18n.jsx';
import styles from '../../App.module.css';

export default function AppShell({ wide, children, onShowPrivacy }) {
  const { lang, setLang, t } = useTranslation();
  return (
    <main className={`${styles.container} ${wide ? styles.wide : ''}`}>
      <div className={styles.topBar}>
        <h1 className={styles.header}>{t.appTitle}</h1>
        <button
          className={styles.langBtn}
          onClick={() => setLang(lang === 'el' ? 'en' : 'el')}
          aria-label="Switch language"
        >
          {lang === 'el' ? 'EN' : 'EL'}
        </button>
      </div>
      {children}
      <footer className={styles.footer}>
        <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacy(); }} className={styles.footerLink}>{t.privacyLink}</a>
      </footer>
    </main>
  );
}
