import { useState } from 'react';
import { useGeolocation, GEOLOCATION_STATES } from './hooks/useGeolocation.js';
import { useStops, FETCH_STATES as STOPS_STATES } from './hooks/useStops.js';
import { useArrivals } from './hooks/useArrivals.js';
import { useTranslation } from './i18n.jsx';
import LocationGate from './components/LocationGate/LocationGate.jsx';
import StopCard from './components/StopCard/StopCard.jsx';
import MapView from './components/MapView/MapView.jsx';
import StatusMessage from './components/StatusMessage/StatusMessage.jsx';
import styles from './App.module.css';

export default function App() {
  const { lang, setLang, t } = useTranslation();
  const { coords, state: geoState, retry } = useGeolocation();
  const { stops, state: stopsState } = useStops(
    coords?.lat,
    coords?.lng,
  );
  const [selectedStop, setSelectedStop] = useState(null);
  const [view, setView] = useState('list');
  const { arrivals, secondsAgo, state: arrivalsState } = useArrivals(selectedStop);

  const handleStopSelect = (code) => {
    setSelectedStop((prev) => (prev === code ? null : code));
  };

  if (geoState === GEOLOCATION_STATES.PENDING) {
    return (
      <main className={styles.container}>
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
        <LocationGate state={geoState} />
      </main>
    );
  }

  if (
    geoState === GEOLOCATION_STATES.DENIED ||
    geoState === GEOLOCATION_STATES.UNAVAILABLE
  ) {
    return (
      <main className={styles.container}>
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
        <LocationGate state={geoState} onRetry={retry} />
      </main>
    );
  }

  return (
    <main className={`${styles.container} ${view === 'map' ? styles.wide : ''}`}>
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

      {stopsState === STOPS_STATES.LOADING && (
        <StatusMessage type="status" message={t.searchingStops} />
      )}

      {stopsState === STOPS_STATES.ERROR && (
        <StatusMessage type="error" message={t.telematicsDown} />
      )}

      {stopsState === STOPS_STATES.OUTSIDE_AREA && (
        <StatusMessage type="status" message={t.outsideServiceArea} />
      )}

      {stopsState === STOPS_STATES.READY && stops.length === 0 && (
        <StatusMessage type="status" message={t.noStopsFound} />
      )}

      {stopsState === STOPS_STATES.READY && stops.length > 0 && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toggle} role="group" aria-label={t.viewLabel}>
              <button
                className={`${styles.toggleBtn} ${view === 'list' ? styles.toggleActive : ''}`}
                onClick={() => { setView('list'); setSelectedStop(null); }}
                aria-pressed={view === 'list'}
              >
                {t.listView}
              </button>
              <button
                className={`${styles.toggleBtn} ${view === 'map' ? styles.toggleActive : ''}`}
                onClick={() => setView('map')}
                aria-pressed={view === 'map'}
              >
                {t.mapView}
              </button>
            </div>
          </div>

          {view === 'list' && (
            <section aria-label={t.nearbyStops}>
              {stops.map((stop) => (
                <StopCard
                  key={stop.code}
                  stop={stop}
                  isSelected={selectedStop === stop.code}
                  onSelect={handleStopSelect}
                  arrivals={arrivals}
                  secondsAgo={secondsAgo}
                  arrivalsState={arrivalsState}
                />
              ))}
            </section>
          )}

          {view === 'map' && (
            <MapView
              coords={coords}
              stops={stops}
              selectedStop={selectedStop}
              onStopSelect={handleStopSelect}
              arrivals={arrivals}
              secondsAgo={secondsAgo}
              arrivalsState={arrivalsState}
            />
          )}
        </>
      )}
    </main>
  );
}
