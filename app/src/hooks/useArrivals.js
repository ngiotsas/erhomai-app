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
  const timerRef = useRef(null);
  const activeStopRef = useRef(stopCode);

  const fetchArrivals = useCallback(async (code) => {
    if (!code) return;
    setState(FETCH_STATES.LOADING);
    try {
      const res = await fetch(`/api/arrivals?stop=${code}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (activeStopRef.current !== code) return;
      setArrivals(data.arrivals);
      setFetchedAt(Date.now());
      setSecondsAgo(0);
      setState(FETCH_STATES.READY);
    } catch {
      if (activeStopRef.current !== code) return;
      setState(FETCH_STATES.ERROR);
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

    const poll = setInterval(() => {
      fetchArrivals(stopCode);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [stopCode, fetchArrivals]);

  useEffect(() => {
    if (state !== FETCH_STATES.READY || !fetchedAt) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - fetchedAt) / 1000));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [state, fetchedAt]);

  return { arrivals, fetchedAt, secondsAgo, state };
}
