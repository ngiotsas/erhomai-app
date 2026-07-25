import { useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '../../i18n.jsx';
import ArrivalItem from '../ArrivalItem/ArrivalItem.jsx';
import StatusMessage from '../StatusMessage/StatusMessage.jsx';
import { FETCH_STATES } from '../../hooks/useArrivals.js';
import styles from './MapView.module.css';

const TILES_EL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const ATTR_EL = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILES_EN = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ATTR_EN = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

function createStopIcon(isSelected) {
  const color = isSelected ? '#fff' : '#111';
  const svg = `<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect x="0" y="2" width="22" height="10" rx="2" stroke="${color}" stroke-width="1.5"/>
<rect x="3" y="4" width="7" height="4" rx="1" fill="${color}" opacity="0.2"/>
<rect x="11" y="4" width="8" height="4" rx="1" fill="${color}" opacity="0.2"/>
<circle cx="4.5" cy="13.5" r="1.5" fill="${color}"/>
<circle cx="17.5" cy="13.5" r="1.5" fill="${color}"/>
</svg>`;
  return L.divIcon({
    className: `${styles.pin} ${isSelected ? styles.pinSelected : ''}`,
    html: svg,
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
    ariaLabel: null,
  });
}

function userIcon() {
  return L.divIcon({
    className: styles.userDot,
    html: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function RecenterButton({ coords, label }) {
  const map = useMap();
  return (
    <button
      className={styles.recenter}
      onClick={() => map.setView([coords.lat, coords.lng], 15)}
      aria-label={label}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
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
  const { lang, t, display } = useTranslation();
  const selectedStopData = useMemo(
    () => stops.find((s) => s.code === selectedStop),
    [stops, selectedStop],
  );

  const handleStopSelect = useCallback(
    (code) => {
      onStopSelect(code === selectedStop ? null : code);
    },
    [onStopSelect, selectedStop],
  );

  const userMarkerIcon = useMemo(() => userIcon(), []);

  const tileUrl = lang === 'en' ? TILES_EN : TILES_EL;
  const tileAttr = lang === 'en' ? ATTR_EN : ATTR_EL;

  if (!coords) return null;

  return (
    <div className={styles.outer}>
      <div className={styles.mapWrapper} role="region" aria-label={t.mapRegion}>
        <MapContainer
          center={[coords.lat, coords.lng]}
          zoom={15}
          className={styles.map}
          zoomControl={false}
          keyboard={true}
        >
          <TileLayer
            key={lang}
            url={tileUrl}
            maxZoom={19}
            attribution={tileAttr}
          />

          <Marker
            position={[coords.lat, coords.lng]}
            icon={userMarkerIcon}
            interactive={false}
            zIndexOffset={1000}
          />

          {stops.map((stop) => {
            const isSelected = stop.code === selectedStop;
            const icon = createStopIcon(isSelected);
            const title = display(stop.name, stop.nameEn);
            return (
              <Marker
                key={stop.code}
                position={[stop.lat, stop.lng]}
                icon={icon}
                zIndexOffset={isSelected ? 2000 : 0}
                keyboard={true}
                title={title}
                eventHandlers={{ click: () => handleStopSelect(stop.code) }}
              >
                <Popup>
                  <div className={styles.popup}>
                    <p className={styles.popupName}>{title}</p>
                    {display(stop.street, stop.streetEn) && (
                      <p className={styles.popupStreet}>{display(stop.street, stop.streetEn)}</p>
                    )}
                    <p className={styles.popupDistance}>{stop.distanceMeters} μ</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          <RecenterButton coords={coords} label={t.centerMap} />
        </MapContainer>

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
                {lang === 'en' && selectedStopData.name ? ` · ${selectedStopData.name}` : lang === 'el' && selectedStopData.nameEn ? ` · ${selectedStopData.nameEn}` : ''}
                {' · '}{selectedStopData.distanceMeters} μ
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
