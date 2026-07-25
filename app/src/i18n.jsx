import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { toLatin } from './transliterate.js';

const LANG_KEY = 'erhomai-lang';

export const translations = {
  el: {
    appTitle: 'Έρχομαι',
    locating: 'Εντοπισμός τοποθεσίας…',
    locationRequired: 'Η τοποθεσία σου είναι απαραίτητη για να βρούμε τις κοντινές στάσεις.',
    locationHint: 'Ενεργοποίησε την πρόσβαση στην τοποθεσία από τις ρυθμίσεις του browser σου και δοκίμασε ξανά.',
    tryAgain: 'Δοκιμή ξανά',
    locationUnavailable: 'Δεν ήταν δυνατός ο εντοπισμός της τοποθεσίας σου.',
    searchingStops: 'Αναζήτηση κοντινών στάσεων…',
    telematicsDown: 'Το σύστημα τηλεματικής του ΟΑΣΑ δεν απαντάει αυτή τη στιγμή.',
    noStopsFound: 'Δεν βρέθηκαν στάσεις κοντά σου.',
    listView: 'Λίστα',
    mapView: 'Χάρτης',
    viewLabel: 'Προβολή',
    nearbyStops: 'Κοντινές στάσεις',
    loadingArrivals: 'Φόρτωση αφίξεων…',
    noArrivals: 'Καμία άφιξη αυτή τη στιγμή.',
    secondsAgo: (n) => {
      if (n === 0) return 'τώρα';
      return `πριν από ${n} ${n === 1 ? 'δευτερόλεπτο' : 'δευτερόλεπτα'}`;
    },
    tapStopHint: 'Πάτησε μια στάση για τις αφίξεις',
    centerMap: 'Κέντρο χάρτη στην τοποθεσία μου',
    closePanel: 'Κλείσιμο πληροφοριών στάσης',
    arrivalsForStop: (name) => `Αφίξεις για τη στάση ${name}`,
    arrivalsLabel: 'Αφίξεις',
    inMinutes: (n) => {
      if (n === 0) return 'τώρα';
      return `σε ${n} ${n === 1 ? 'λεπτό' : 'λεπτά'}`;
    },
    soon: 'σύντομα',
    lineLabel: (id) => `Γραμμή ${id}`,
    stopLabel: (name, meters) => `Στάση ${name}, ${meters} μέτρα`,
    mapRegion: 'Χάρτης με κοντινές στάσεις',
    telematicsDownShort: 'Το σύστημα τηλεματικής δεν απαντάει.',
    metersShort: 'μ',
    outsideServiceArea: 'Οι στάσεις του ΟΑΣΑ καλύπτουν μόνο την Αττική.',
  },
  en: {
    appTitle: 'Erhomai',
    locating: 'Locating you…',
    locationRequired: 'Your location is needed to find nearby stops.',
    locationHint: 'Enable location access in your browser settings and try again.',
    tryAgain: 'Try again',
    locationUnavailable: 'Could not determine your location.',
    searchingStops: 'Searching for nearby stops…',
    telematicsDown: 'The OASA telematics system is currently unavailable.',
    noStopsFound: 'No stops found near you.',
    listView: 'List',
    mapView: 'Map',
    viewLabel: 'View',
    nearbyStops: 'Nearby stops',
    loadingArrivals: 'Loading arrivals…',
    noArrivals: 'No arrivals at this time.',
    secondsAgo: (n) => {
      if (n === 0) return 'now';
      return `${n} second${n !== 1 ? 's' : ''} ago`;
    },
    tapStopHint: 'Tap a stop for arrivals',
    centerMap: 'Center map on my location',
    closePanel: 'Close stop info',
    arrivalsForStop: (name) => `Arrivals for ${name}`,
    arrivalsLabel: 'Arrivals',
    inMinutes: (n) => {
      if (n === 0) return 'now';
      return `in ${n} minute${n !== 1 ? 's' : ''}`;
    },
    soon: 'soon',
    lineLabel: (id) => `Line ${id}`,
    stopLabel: (name, meters) => `Stop ${name}, ${meters} meters away`,
    mapRegion: 'Map with nearby stops',
    telematicsDownShort: 'The telematics system is not responding.',
    metersShort: 'm',
    outsideServiceArea: 'OASA stops cover the Athens metropolitan area only.',
  },
};

const defaultDisplay = (greekText, englishText) => {
  if (!greekText) return englishText ?? greekText;
  return greekText;
};
const defaultAlternate = () => null;
const defaultContext = {
  lang: 'el',
  setLang: () => {},
  t: translations.el,
  display: defaultDisplay,
  alternate: defaultAlternate,
};

const LangContext = createContext(defaultContext);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'el' || stored === 'en') return stored;
    } catch {}
    return navigator.language?.split('-')[0] === 'el' ? 'el' : 'en';
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
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

export function useTranslation() {
  return useContext(LangContext);
}
