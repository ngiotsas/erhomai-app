import { useMemo, useCallback, useEffect, useRef } from 'react';
import { Map, NavigationControl, Marker, Popup } from 'maplibre-gl';
import { useTranslation } from '../../i18n.jsx';
import ArrivalItem from '../ArrivalItem/ArrivalItem.jsx';
import StatusMessage from '../StatusMessage/StatusMessage.jsx';
import { FETCH_STATES } from '../../hooks/useArrivals.js';
import styles from './MapView.module.css';

const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function createStopElement(isSelected) {
  const el = document.createElement('div');
  const cls = isSelected ? `${styles.pin} ${styles.pinSelected}` : styles.pin;
  el.className = cls;
  const color = isSelected ? '#fff' : '#111';
  el.innerHTML = `<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect x="0" y="2" width="22" height="10" rx="2" stroke="${color}" stroke-width="1.5"/>
<rect x="3" y="4" width="7" height="4" rx="1" fill="${color}" opacity="0.2"/>
<rect x="11" y="4" width="8" height="4" rx="1" fill="${color}" opacity="0.2"/>
<circle cx="4.5" cy="13.5" r="1.5" fill="${color}"/>
<circle cx="17.5" cy="13.5" r="1.5" fill="${color}"/>
</svg>`;
  return el;
}

export default function MapView({
  coords,
  stops,
  selectedStop,
  onStopSelect,
  arrivals,
  secondsAgo,
  arrivalsState,
}) {
  const { lang, t, display, alternate } = useTranslation();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);

  const selectedStopData = useMemo(
    () => stops.find((s) => s.code === selectedStop),
    [stops, selectedStop],
  );

  const handleStopSelect = useCallback(
    (code) => { onStopSelect(code); },
    [onStopSelect],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [coords.lng, coords.lat],
      zoom: 15,
      attributionControl: true,
      cooperativeGestures: true,
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    stops.forEach((stop) => {
      const isSelected = stop.code === selectedStop;
      const el = createStopElement(isSelected);
      el.title = display(stop.name, stop.nameEn);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => handleStopSelect(stop.code));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStopSelect(stop.code);
        }
      });

      const popupHtml = `<div class="${styles.popup}">
        <p class="${styles.popupName}">${display(stop.name, stop.nameEn)}</p>
        ${display(stop.street, stop.streetEn) ? `<p class="${styles.popupStreet}">${display(stop.street, stop.streetEn)}</p>` : ''}
        <p class="${styles.popupDistance}">${stop.distanceMeters} ${t.metersShort}</p>
      </div>`;

      const marker = new Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, -4],
      })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(new Popup({ offset: 28, closeButton: false })
          .setHTML(popupHtml))
        .addTo(map);

      markersRef.current[stop.code] = marker;
    });
  }, [stops, selectedStop, lang, display, t, handleStopSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const el = document.createElement('div');
    el.className = styles.userDot;

    userMarkerRef.current = new Marker({ element: el })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);
  }, [coords]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    map.flyTo({ center: [coords.lng, coords.lat], zoom: 15 });
  }, [coords]);

  if (!coords) return null;

  return (
    <div className={styles.outer}>
      <div className={styles.mapWrapper} role="region" aria-label={t.mapRegion}>
        <div
          ref={containerRef}
          className={styles.map}
          data-testid="map-container"
        />

        <button
          className={styles.recenter}
          onClick={handleRecenter}
          aria-label={t.centerMap}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {!selectedStop && (
          <p className={styles.hint}>{t.tapStopHint}</p>
        )}
      </div>

      {selectedStop && selectedStopData && (
        <section
          className={styles.panel}
          aria-label={t.arrivalsForStop(display(selectedStopData.name, selectedStopData.nameEn))}
        >
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelStopName}>{display(selectedStopData.name, selectedStopData.nameEn)}</h2>
              <p className={styles.panelStopDetails}>
                {selectedStopData.code}
                {display(selectedStopData.street, selectedStopData.streetEn) ? ` · ${display(selectedStopData.street, selectedStopData.streetEn)}` : ''}
                {alternate(selectedStopData.name, selectedStopData.nameEn) ? ` · ${alternate(selectedStopData.name, selectedStopData.nameEn)}` : ''}
                {' · '}{selectedStopData.distanceMeters} {t.metersShort}
              </p>
            </div>
            <button
              className={styles.panelClose}
              onClick={() => onStopSelect(null)}
              aria-label={t.closePanel}
            >
              ✕
            </button>
          </div>

          <div className={styles.panelBody}>
            {arrivalsState === FETCH_STATES.LOADING && (
              <StatusMessage type="status" message={t.loadingArrivals} />
            )}
            {arrivalsState === FETCH_STATES.ERROR && (
              <StatusMessage type="error" message={t.telematicsDownShort} />
            )}
            {arrivalsState === FETCH_STATES.READY && arrivals.length === 0 && (
              <StatusMessage type="status" message={t.noArrivals} />
            )}
            {arrivalsState === FETCH_STATES.READY && arrivals.length > 0 && (
              <>
                <ul className={styles.arrivalList} aria-label={t.arrivalsLabel}>
                  {arrivals.map((a, i) => (
                    <ArrivalItem
                      key={`${a.lineId}-${a.vehicleCode}-${i}`}
                      arrival={a}
                    />
                  ))}
                </ul>
                <p className={styles.staleIndicator} aria-live="polite">
                  {t.secondsAgo(secondsAgo)}
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
