import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 25000;

export const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

export function useArrivals(stopCode) {
  const [arrivals, setArrivals] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [state, setState] = useState(FETCH_STATES.IDLE);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const activeStopRef = useRef(stopCode);
  const lastFetchRef = useRef(0);
  const abortRef = useRef(null);

  const fetchArrivals = useCallback(async (code, { background = false } = {}) => {
    if (!code) return;
    if (!background) setState(FETCH_STATES.LOADING);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch(`/api/arrivals?stop=${code}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (activeStopRef.current !== code) return;
      setArrivals(data.arrivals ?? []);
      setFetchedAt(Date.now());
      setSecondsAgo(0);
      setState(FETCH_STATES.READY);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[arrivals]', error);
      if (activeStopRef.current !== code) return;
      if (!background) setState(FETCH_STATES.ERROR);
    }
  }, []);

  useEffect(() => {
    if (!stopCode) {
      activeStopRef.current = null;
      setArrivals(null);
      setFetchedAt(null);
      setState(FETCH_STATES.IDLE);
      setSecondsAgo(0);
      return;
    }

    activeStopRef.current = stopCode;
    setArrivals(null);
    setFetchedAt(null);
    setState(FETCH_STATES.IDLE);
    setSecondsAgo(0);

    fetchArrivals(stopCode);
    lastFetchRef.current = Date.now();

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchRef.current < 10000) return;
      lastFetchRef.current = Date.now();
      fetchArrivals(stopCode, { background: true });
    };
    const poll = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      abortRef.current?.abort();
    };
  }, [stopCode, fetchArrivals]);

  useEffect(() => {
    if (state !== FETCH_STATES.READY || !fetchedAt) return;

    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - fetchedAt) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [state, fetchedAt]);

  return { arrivals, fetchedAt, state };
}
