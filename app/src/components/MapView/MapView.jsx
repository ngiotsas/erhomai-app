import { useMemo, useCallback, useEffect, useRef } from 'react';
import { Map, NavigationControl, Marker, Popup } from 'maplibre-gl';
import { useTranslation } from '../../i18n.jsx';
import { createStyle } from '../../mapStyle.js';
import ArrivalItem from '../ArrivalItem/ArrivalItem.jsx';
import StatusMessage from '../StatusMessage/StatusMessage.jsx';
import SecondsAgo from '../SecondsAgo/SecondsAgo.jsx';
import { FETCH_STATES } from '../../hooks/useArrivals.js';
import styles from './MapView.module.css';

const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function createStopElement() {
  const el = document.createElement('div');
  el.className = styles.pin;
  el.innerHTML = `<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect x="0" y="2" width="22" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
<rect x="3" y="4" width="7" height="4" rx="1" fill="currentColor" opacity="0.2"/>
<rect x="11" y="4" width="8" height="4" rx="1" fill="currentColor" opacity="0.2"/>
<circle cx="4.5" cy="13.5" r="1.5" fill="currentColor"/>
<circle cx="17.5" cy="13.5" r="1.5" fill="currentColor"/>
</svg>`;
  return el;
}

function applySelectionStyle(markers, selectedStopCode) {
  Object.entries(markers).forEach(([code, marker]) => {
    const el = marker.getElement();
    el.className = code === selectedStopCode ? `${styles.pin} ${styles.pinSelected}` : styles.pin;
  });
}

export default function MapView({
  coords,
  stops,
  selectedStop,
  onStopSelect,
  arrivals,
  fetchedAt,
  arrivalsState,
}) {
  const { lang, t, display, alternate } = useTranslation();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const initialCoordsRef = useRef(null);
  const langRef = useRef(lang);

  const selectedStopData = useMemo(
    () => stops.find((s) => s.code === selectedStop),
    [stops, selectedStop],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !coords) return;
    initialCoordsRef.current = coords;
    const center = initialCoordsRef.current;

    const map = new Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [center.lng, center.lat],
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- map mounts once, coords in ref

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (langRef.current === lang && langRef.current === 'el') return;
    langRef.current = lang;
    let cancelled = false;
    createStyle(lang).then((style) => {
      if (!cancelled) map.setStyle(style);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lang]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    stops.forEach((stop) => {
      const el = createStopElement();
      el.title = display(stop.name, stop.nameEn);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => onStopSelect(stop.code));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStopSelect(stop.code);
        }
      });

      const popupEl = document.createElement('div');
      popupEl.className = styles.popup;
      const name = document.createElement('p');
      name.className = styles.popupName;
      name.textContent = display(stop.name, stop.nameEn);
      popupEl.append(name);
      if (display(stop.street, stop.streetEn)) {
        const street = document.createElement('p');
        street.className = styles.popupStreet;
        street.textContent = display(stop.street, stop.streetEn);
        popupEl.append(street);
      }
      const dist = document.createElement('p');
      dist.className = styles.popupDistance;
      dist.textContent = stop.distanceMeters + ' ' + t.metersShort;
      popupEl.append(dist);

      const marker = new Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, -4],
      })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(new Popup({ offset: 28, closeButton: false })
          .setDOMContent(popupEl))
        .addTo(map);

      markersRef.current[stop.code] = marker;
    });

    applySelectionStyle(markersRef.current, selectedStop);

    return () => {
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
    };
  }, [stops, selectedStop, display, t, onStopSelect]);

  useEffect(() => {
    applySelectionStyle(markersRef.current, selectedStop);
  }, [selectedStop]);

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
                    {arrivals.map((a) => (
                      <ArrivalItem
                        key={a.vehicleCode}
                      arrival={a}
                    />
                  ))}
                </ul>
                <SecondsAgo fetchedAt={fetchedAt} className={styles.staleIndicator} />
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
