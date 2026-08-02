import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useGeolocation, GEOLOCATION_STATES } from './hooks/useGeolocation.js';
import { useStops, FETCH_STATES as STOPS_STATES } from './hooks/useStops.js';
import { useArrivals } from './hooks/useArrivals.js';
import { useTranslation } from './LangContext.js';
import LocationGate from './components/LocationGate/LocationGate.jsx';
import StopCard from './components/StopCard/StopCard.jsx';
import StatusMessage from './components/StatusMessage/StatusMessage.jsx';
import LegalNotice from './components/Legal/Legal.jsx';
import AppShell from './components/AppShell/AppShell.jsx';
import styles from './App.module.css';

const MapView = lazy(() => import('./components/MapView/MapView.jsx'));
const SearchView = lazy(() => import('./components/SearchView/SearchView.jsx'));

export default function App() {
  const { t } = useTranslation();
  const { coords, state: geoState, permissionState, retry } = useGeolocation();
  const { stops, state: stopsState } = useStops(
    coords?.lat,
    coords?.lng,
    20,
  );
  const [selectedStop, setSelectedStop] = useState(null);
  const [view, setView] = useState('list');
  const { arrivals, fetchedAt, state: arrivalsState } = useArrivals(selectedStop);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleStopSelect = useCallback((code) => {
    setSelectedStop((prev) => (prev === code ? null : code));
  }, []);

  const showPrivacyPage = useCallback(() => setShowPrivacy(true), []);
  const hidePrivacyPage = useCallback(() => setShowPrivacy(false), []);

  const locationReady = geoState === GEOLOCATION_STATES.READY;

  // Search needs no location. If location ends up blocked/unavailable, land on
  // the search view so the app stays usable instead of a dead end.
  /* eslint-disable react-hooks/set-state-in-effect -- adjusts landing view when location is blocked */
  useEffect(() => {
    if (geoState === GEOLOCATION_STATES.DENIED || geoState === GEOLOCATION_STATES.UNAVAILABLE) {
      setView((prev) => (prev === 'list' || prev === 'map' ? 'search' : prev));
    }
  }, [geoState]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (showPrivacy) {
    return <LegalNotice onBack={hidePrivacyPage} />;
  }

  if (geoState === GEOLOCATION_STATES.PENDING) {
    return (
      <AppShell onShowPrivacy={showPrivacyPage}>
        <LocationGate state={geoState} onShowPrivacy={showPrivacyPage} />
      </AppShell>
    );
  }

  return (
    <AppShell wide={view === 'map'} onShowPrivacy={showPrivacyPage}>
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
          <button
            className={`${styles.toggleBtn} ${view === 'search' ? styles.toggleActive : ''}`}
            onClick={() => setView('search')}
            aria-pressed={view === 'search'}
          >
            {t.searchView}
          </button>
        </div>
      </div>

      {view === 'search' && (
        <Suspense fallback={<StatusMessage type="status" message={t.searchingStops} />}>
          <SearchView
            onStopSelect={handleStopSelect}
            selectedStop={selectedStop}
            arrivals={arrivals}
            fetchedAt={fetchedAt}
            arrivalsState={arrivalsState}
          />
        </Suspense>
      )}

      {view !== 'search' && !locationReady && (
        <LocationGate
          state={geoState}
          permissionState={permissionState}
          onRetry={retry}
          onShowPrivacy={showPrivacyPage}
        />
      )}

      {view !== 'search' && locationReady && (
        <>
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

          {view === 'list' && stops && stops.length > 0 && (
            <section className={styles.list} aria-label={t.nearbyStops}>
              {stops.map((stop) => (
                <StopCard
                  key={stop.code}
                  stop={stop}
                  isSelected={selectedStop === stop.code}
                  onSelect={handleStopSelect}
                  arrivals={arrivals}
                  fetchedAt={fetchedAt}
                  arrivalsState={arrivalsState}
                />
              ))}
            </section>
          )}

          {view === 'map' && stops && stops.length > 0 && (
            <Suspense fallback={<StatusMessage type="status" message={t.searchingStops} />}>
              <MapView
                coords={coords}
                stops={stops}
                selectedStop={selectedStop}
                onStopSelect={handleStopSelect}
                arrivals={arrivals}
                fetchedAt={fetchedAt}
                arrivalsState={arrivalsState}
              />
            </Suspense>
          )}
        </>
      )}

      <section className={styles.dataCollection}>
        <h2 className={styles.dataCollectionTitle}>{t.dataCollectionTitle}</h2>
        <p className={styles.dataCollectionText}>{t.dataCollectionText}</p>
        <a href="#" onClick={(e) => { e.preventDefault(); showPrivacyPage(); }} className={styles.dataCollectionLink}>{t.dataCollectionMore}</a>
      </section>
    </AppShell>
  );
}
