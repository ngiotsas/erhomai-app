import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from '../../LangContext.js';
import styles from './SearchView.module.css';
import ArrivalItem from '../ArrivalItem/ArrivalItem.jsx';
import StatusMessage from '../StatusMessage/StatusMessage.jsx';
import SecondsAgo from '../SecondsAgo/SecondsAgo.jsx';
import { FETCH_STATES as ARRIVALS_STATES } from '../../hooks/useArrivals.js';

// Normalize Greek characters to Latin equivalents for URL-safe line IDs
const GREEK_TO_LATIN = {
  'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'h','ι':'i',
  'κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p','ρ':'r',
  'σ':'s','ς':'s','τ':'t','υ':'y','φ':'f','χ':'x','ψ':'ps','ω':'o',
};
function normalizeLineId(id) {
  if (!id) return id;
  return [...id].map(c => GREEK_TO_LATIN[c.toLowerCase()] || c).join('');
}

function useLineSearch() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch('/api/lines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: q.trim() }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { query, suggestions, loading, search, setQuery };
}

function useStopSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [indexInfo, setIndexInfo] = useState(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const search = useCallback((q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) {
      setResults([]);
      setIndexInfo(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch('/api/search-stops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: q.trim() }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data.stops ?? []);
        setIndexInfo(data.index ?? null);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { query, results, loading, indexInfo, search, setQuery };
}

function useLineStops(lineId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* eslint-disable react-hooks/set-state-in-effect -- resets state on lineId change */
  useEffect(() => {
    if (!lineId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/lines/${encodeURIComponent(lineId)}/stops`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lineId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { data, loading, error };
}

export default function SearchView({
  onStopSelect,
  selectedStop,
  arrivals,
  fetchedAt,
  arrivalsState,
}) {
  const { t, display } = useTranslation();
  const [mode, setMode] = useState('line');
  const [selectedLineId, setSelectedLineId] = useState(null);

  const lineSearch = useLineSearch();
  const stopSearch = useStopSearch();
  const { data: lineStopsData, loading: lineStopsLoading, error: lineStopsError } = useLineStops(selectedLineId);

  const handleLineSelect = useCallback((lineId) => {
    const normalized = normalizeLineId(lineId);
    setSelectedLineId(normalized);
    lineSearch.setQuery(lineId);
  }, [lineSearch]);

  const handleLineClear = useCallback(() => {
    setSelectedLineId(null);
    lineSearch.setQuery('');
  }, [lineSearch]);

  return (
    <section className={styles.wrapper} aria-label={t.searchView}>
      <div className={styles.modeToggle} role="group" aria-label={t.searchView}>
        <button
          className={`${styles.modeBtn} ${mode === 'line' ? styles.modeActive : ''}`}
          onClick={() => setMode('line')}
          aria-pressed={mode === 'line'}
        >
          {t.searchByLine}
        </button>
        <button
          className={`${styles.modeBtn} ${mode === 'stop' ? styles.modeActive : ''}`}
          onClick={() => setMode('stop')}
          aria-pressed={mode === 'stop'}
        >
          {t.searchByStop}
        </button>
      </div>

      {mode === 'line' && (
        <div className={styles.searchPanel}>
          <label className={styles.inputLabel}>
            <span className={styles.inputLabelText}>{t.searchLineLabel}</span>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type="text"
                value={lineSearch.query}
                onChange={(e) => { lineSearch.search(e.target.value); setSelectedLineId(null); }}
                placeholder={t.searchLinePlaceholder}
                aria-label={t.searchLineLabel}
              />
              {lineSearch.query && (
                <button
                  className={styles.clearBtn}
                  onClick={handleLineClear}
                  aria-label="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            {!selectedLineId && <span className={styles.inputHint}>{t.searchLineHint}</span>}
          </label>

          {lineSearch.loading && <StatusMessage type="status" message={t.searchingStops} />}

          {!lineSearch.loading && !selectedLineId && lineSearch.query && lineSearch.suggestions.length > 0 && (
            <ul className={styles.suggestions} role="listbox">
              {lineSearch.suggestions.map((line) => (
                <li key={line.lineCode} role="option">
                  <button
                    className={styles.suggestionItem}
                    onClick={() => handleLineSelect(line.lineId)}
                  >
                    <span className={styles.lineIdBadge}>{line.lineId}</span>
                    <span className={styles.lineDesc}>{display(line.lineName, line.lineNameEn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!lineSearch.loading && lineSearch.query && !selectedLineId && lineSearch.suggestions.length === 0 && (
            <StatusMessage type="status" message={t.noLineFound} />
          )}

          {lineStopsLoading && <StatusMessage type="status" message={t.searchingStops} />}
          {lineStopsError && <StatusMessage type="error" message={t.telematicsDown} />}

          {lineStopsData && (
            <div className={styles.lineStopsResult}>
              <div className={styles.lineStopsHeader}>
                <h2 className={styles.lineTitle}>
                  {t.lineStopsFor(lineStopsData.lineId)} — {display(lineStopsData.lineName, lineStopsData.lineNameEn)}
                </h2>
              </div>

              {lineStopsData.routes.map((route) => (
                <div key={route.routeCode} className={styles.routeGroup}>
                  <h3 className={styles.routeTitle}>
                    {t.routeDirection}: {display(route.routeName, route.routeNameEn)}
                    <span className={styles.stopsCount}> · {t.stopsCount(route.stops.length)}</span>
                  </h3>
                  <ul className={styles.stopsList}>
                    {route.stops.map((stop, idx) => {
                      const isSelected = selectedStop === stop.code;
                      return (
                        <li key={stop.code} className={`${styles.stopRow} ${isSelected ? styles.stopRowSelected : ''}`}>
                          <button
                            className={styles.stopBtn}
                            onClick={() => onStopSelect(stop.code)}
                            aria-expanded={isSelected}
                          >
                            <span className={styles.stopOrder}>{idx + 1}</span>
                            <div className={styles.stopInfo}>
                              <span className={styles.stopName}>{display(stop.name, stop.nameEn)}</span>
                              {display(stop.street, stop.streetEn) && (
                                <span className={styles.stopStreet}>{display(stop.street, stop.streetEn)}</span>
                              )}
                            </div>
                          </button>
                          {isSelected && (
                            <div className={styles.stopArrivals}>
                              {arrivalsState === ARRIVALS_STATES.LOADING && (
                                <StatusMessage type="status" message={t.loadingArrivals} />
                              )}
                              {arrivalsState === ARRIVALS_STATES.ERROR && (
                                <StatusMessage type="error" message={t.telematicsDownShort} />
                              )}
                              {arrivalsState === ARRIVALS_STATES.READY && arrivals.length === 0 && (
                                <StatusMessage type="status" message={t.noArrivals} />
                              )}
                              {arrivalsState === ARRIVALS_STATES.READY && arrivals.length > 0 && (
                                <>
                                  <ul className={styles.arrivalList} aria-label={t.arrivalsLabel}>
                                    {arrivals.map((a) => (
                                      <ArrivalItem key={a.vehicleCode} arrival={a} />
                                    ))}
                                  </ul>
                                  <SecondsAgo fetchedAt={fetchedAt} className={styles.staleIndicator} />
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'stop' && (
        <div className={styles.searchPanel}>
          <label className={styles.inputLabel}>
            <span className={styles.inputLabelText}>{t.searchStopLabel}</span>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type="text"
                value={stopSearch.query}
                onChange={(e) => stopSearch.search(e.target.value)}
                placeholder={t.searchStopPlaceholder}
                aria-label={t.searchStopLabel}
              />
              {stopSearch.query && (
                <button
                  className={styles.clearBtn}
                  onClick={() => { stopSearch.search(''); stopSearch.setQuery(''); }}
                  aria-label="Clear"
                >
                  ✕
                </button>
              )}
            </div>
          </label>

          {stopSearch.indexInfo && !stopSearch.indexInfo.ready && stopSearch.indexInfo.building && (
            <StatusMessage type="status" message={t.indexBuilding} />
          )}

          {stopSearch.indexInfo && !stopSearch.indexInfo.ready && !stopSearch.indexInfo.building && stopSearch.indexInfo.stale && (
            <StatusMessage type="status" message={t.indexStale} />
          )}

          {stopSearch.indexInfo && !stopSearch.indexInfo.ready && !stopSearch.indexInfo.building && stopSearch.indexInfo.failed && (
            <StatusMessage type="error" message={t.indexUnavailable} />
          )}

          {stopSearch.loading && <StatusMessage type="status" message={t.searchingStops} />}

          {!stopSearch.loading && stopSearch.results.length > 0 && (
            <ul className={styles.stopsList}>
              {stopSearch.results.map((stop) => {
                const isSelected = selectedStop === stop.code;
                return (
                  <li key={stop.code} className={`${styles.stopRow} ${isSelected ? styles.stopRowSelected : ''}`}>
                    <button
                      className={styles.stopBtn}
                      onClick={() => onStopSelect(stop.code)}
                      aria-expanded={isSelected}
                    >
                      <span className={styles.stopCode}>{stop.code}</span>
                      <div className={styles.stopInfo}>
                        <span className={styles.stopName}>{display(stop.name, stop.nameEn)}</span>
                        {display(stop.street, stop.streetEn) && (
                          <span className={styles.stopStreet}>{display(stop.street, stop.streetEn)}</span>
                        )}
                      </div>
                    </button>
                    {isSelected && (
                      <div className={styles.stopArrivals}>
                        {arrivalsState === ARRIVALS_STATES.LOADING && (
                          <StatusMessage type="status" message={t.loadingArrivals} />
                        )}
                        {arrivalsState === ARRIVALS_STATES.ERROR && (
                          <StatusMessage type="error" message={t.telematicsDownShort} />
                        )}
                        {arrivalsState === ARRIVALS_STATES.READY && arrivals.length === 0 && (
                          <StatusMessage type="status" message={t.noArrivals} />
                        )}
                        {arrivalsState === ARRIVALS_STATES.READY && arrivals.length > 0 && (
                          <>
                            <ul className={styles.arrivalList} aria-label={t.arrivalsLabel}>
                              {arrivals.map((a) => (
                                <ArrivalItem key={a.vehicleCode} arrival={a} />
                              ))}
                            </ul>
                            <SecondsAgo fetchedAt={fetchedAt} className={styles.staleIndicator} />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!stopSearch.loading && stopSearch.query.length >= 2 && stopSearch.results.length === 0 && (
            <StatusMessage type="status" message={t.noStopFound} />
          )}
        </div>
      )}
    </section>
  );
}
