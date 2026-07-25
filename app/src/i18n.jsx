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
    secondsAgo: (n) => `πριν από ${n} δευτερόλεπτα`,
    tapStopHint: 'Πάτησε μια στάση για τις αφίξεις',
    centerMap: 'Κέντρο χάρτη στην τοποθεσία μου',
    closePanel: 'Κλείσιμο πληροφοριών στάσης',
    arrivalsForStop: (name) => `Αφίξεις για τη στάση ${name}`,
    arrivalsLabel: 'Αφίξεις',
    inMinutes: (n) => `σε ${n} λεπτά`,
    soon: 'σύντομα',
    lineLabel: (id) => `Γραμμή ${id}`,
    stopLabel: (name, meters) => `Στάση ${name}, ${meters} μέτρα`,
    mapRegion: 'Χάρτης με κοντινές στάσεις',
    telematicsDownShort: 'Το σύστημα τηλεματικής δεν απαντάει.',
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
    secondsAgo: (n) => `${n} second${n !== 1 ? 's' : ''} ago`,
    tapStopHint: 'Tap a stop for arrivals',
    centerMap: 'Center map on my location',
    closePanel: 'Close stop info',
    arrivalsForStop: (name) => `Arrivals for ${name}`,
    arrivalsLabel: 'Arrivals',
    inMinutes: (n) => `in ${n} minute${n !== 1 ? 's' : ''}`,
    soon: 'soon',
    lineLabel: (id) => `Line ${id}`,
    stopLabel: (name, meters) => `Stop ${name}, ${meters} meters away`,
    mapRegion: 'Map with nearby stops',
    telematicsDownShort: 'The telematics system is not responding.',
  },
};

const LangContext = createContext({ lang: 'el', setLang: () => {}, t: translations.el });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'el' || stored === 'en') return stored;
    } catch {}
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang === 'el') return 'el';
    return 'el';
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = translations[lang];

  const display = useMemo(() => {
    return (greekText, englishText) => {
      if (!greekText) return englishText ?? greekText;
      if (lang === 'el') return greekText;
      return englishText ?? toLatin(greekText);
    };
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, display }}>
      {children}
    </LangContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LangContext);
}
