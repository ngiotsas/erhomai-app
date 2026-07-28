import { useState, useEffect, useCallback, useRef } from 'react';

export const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  OUTSIDE_AREA: 'outside_area',
};

export function useStops(lat, lng) {
  const [stops, setStops] = useState(null);
  const [state, setState] = useState(FETCH_STATES.IDLE);
  const abortRef = useRef(null);

  const fetchStops = useCallback(async () => {
    if (lat == null || lng == null) return;
    setState(FETCH_STATES.LOADING);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/stops?lat=${lat}&lng=${lng}&limit=5`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'outside_service_area') {
          setState(FETCH_STATES.OUTSIDE_AREA);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setStops(Array.isArray(data.stops) ? data.stops : []);
      setState(FETCH_STATES.READY);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[stops]', error);
      setState(FETCH_STATES.ERROR);
    }
  }, [lat, lng]);

  useEffect(() => {
    fetchStops();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchStops]);

  return { stops, state };
}
