import { useState, useEffect, useCallback } from 'react';

export const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

export function useStops(lat, lng) {
  const [stops, setStops] = useState(null);
  const [state, setState] = useState(FETCH_STATES.IDLE);

  const fetchStops = useCallback(async () => {
    if (lat == null || lng == null) return;
    setState(FETCH_STATES.LOADING);
    try {
      const res = await fetch(`/api/stops?lat=${lat}&lng=${lng}&limit=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStops(Array.isArray(data.stops) ? data.stops : []);
      setState(FETCH_STATES.READY);
    } catch (error) {
      console.error('[stops]', error);
      setState(FETCH_STATES.ERROR);
    }
  }, [lat, lng]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  return { stops, state };
}
