import { useState, useEffect, useCallback } from 'react';

const STOPS_TTL_MS = 5 * 60 * 1000;

let cache = null;
let cacheFor = null;
let cacheExpires = 0;

export const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

function cacheKey(lat, lng) {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

export function useStops(lat, lng) {
  const [stops, setStops] = useState(null);
  const [state, setState] = useState(FETCH_STATES.IDLE);

  const fetchStops = useCallback(async () => {
    if (lat == null || lng == null) return;
    const key = cacheKey(lat, lng);
    const now = Date.now();
    if (cacheFor === key && now < cacheExpires && cache) {
      setStops(cache);
      setState(FETCH_STATES.READY);
      return;
    }

    setState(FETCH_STATES.LOADING);
    try {
      const res = await fetch(`/api/stops?lat=${lat}&lng=${lng}&limit=5`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setStops(data.stops);
      cache = data.stops;
      cacheFor = key;
      cacheExpires = now + STOPS_TTL_MS;
      setState(FETCH_STATES.READY);
    } catch {
      setState(FETCH_STATES.ERROR);
    }
  }, [lat, lng]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  return { stops, state };
}
