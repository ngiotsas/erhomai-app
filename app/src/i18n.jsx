import { useState, useEffect, useCallback, useMemo } from 'react';
import { toLatin } from './transliterate.js';
import { translations } from './translations.js';
import { LangContext } from './LangContext.js';

const LANG_KEY = 'erhomai-lang';

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      // URL query param takes priority (for hreflang / sitemap alternates)
      const urlParam = new URL(window.location.href).searchParams.get('lang');
      if (urlParam === 'el' || urlParam === 'en') {
        try { localStorage.setItem(LANG_KEY, urlParam); } catch { /* ignored */ }
        return urlParam;
      }
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'el' || stored === 'en') return stored;
    } catch { /* localStorage may be unavailable */ }
    return navigator.language?.split('-')[0] === 'el' ? 'el' : 'en';
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* localStorage may be unavailable */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = translations[lang];

  const display = useCallback((greekText, englishText) => {
    if (!greekText) return englishText ?? greekText;
    if (lang === 'el') return greekText;
    return englishText ?? toLatin(greekText);
  }, [lang]);

  const alternate = useCallback((greekText, englishText) => {
    return lang === 'el' ? englishText : greekText;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, display, alternate }), [lang, setLang, t, display, alternate]);

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}
